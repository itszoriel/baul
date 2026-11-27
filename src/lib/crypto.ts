import "server-only";

import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "crypto";
import { appSecret, previousAppSecret } from "./env";

/**
 * Application cryptography.
 *
 * Each purpose uses its own key derived from APP_SECRET with HKDF, so a
 * weakness or disclosure in one use cannot be replayed against another.
 * APP_SECRET_PREVIOUS (optional) keeps values written under the previous
 * secret readable during a rotation; new values always use the current one.
 *
 * - Recovery emails: AES-256-GCM at rest, format `v2.<iv>.<tag>.<data>`.
 * - Blind index: HMAC so "I lost my key" can find vaults without plaintext.
 * - Join tickets: short-lived proof that a key was just verified.
 * - Limiter identifiers: HMAC so rate-limit rows never hold raw values.
 *
 * Legacy (pre-v2) values used SHA-256(APP_SECRET) directly and remain
 * readable; POST /api/cron/rekey-recovery-emails rewrites them.
 */

type Purpose = "email-encryption" | "email-index" | "join-ticket" | "limiter";

function secrets(): string[] {
  const previous = previousAppSecret();
  return previous ? [appSecret(), previous] : [appSecret()];
}

function subkey(secret: string, purpose: Purpose): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "baul-app-secret-v2", purpose, 32));
}

function legacyAesKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Recovery email encryption
// ---------------------------------------------------------------------------

export function encryptEmail(email: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", subkey(appSecret(), "email-encryption"), iv);
  const enc = Buffer.concat([cipher.update(email, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2.${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

function decryptWith(key: Buffer, ivB64: string, tagB64: string, dataB64: string): string | null {
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Decrypt with any accepted secret. `current` is true only when the payload
 * already uses the current secret and format (nothing to re-key).
 */
export function decryptEmail(payload: string): { email: string; current: boolean } {
  const parts = payload.split(".");
  const [first, ...rest] = parts;
  const versioned = first === "v2" && rest.length === 3;
  const [ivB64, tagB64, dataB64] = versioned ? rest : parts;
  if (!ivB64 || !tagB64 || !dataB64 || (!versioned && parts.length !== 3)) {
    throw new Error("Invalid encrypted email payload.");
  }
  const candidates = secrets();
  for (const [index, secret] of candidates.entries()) {
    const key = versioned ? subkey(secret, "email-encryption") : legacyAesKey(secret);
    const email = decryptWith(key, ivB64, tagB64, dataB64);
    if (email !== null) return { email, current: versioned && index === 0 };
  }
  throw new Error("Encrypted email could not be decrypted with any configured secret.");
}

// ---------------------------------------------------------------------------
// Recovery email blind index
// ---------------------------------------------------------------------------

/** The index written for new or re-keyed vaults. */
export function emailBlindIndex(email: string): string {
  return createHmac("sha256", subkey(appSecret(), "email-index")).update(normalizeEmail(email)).digest("hex");
}

/** Every index an existing vault may still carry (current, previous, legacy). */
export function emailBlindIndexCandidates(email: string): string[] {
  const normalized = normalizeEmail(email);
  const values = secrets().flatMap((secret) => [
    createHmac("sha256", subkey(secret, "email-index")).update(normalized).digest("hex"),
    createHmac("sha256", secret).update(normalized).digest("hex"),
  ]);
  return [...new Set(values)];
}

// ---------------------------------------------------------------------------
// Opaque tokens and limiter identifiers
// ---------------------------------------------------------------------------

/** A 256-bit URL-safe secret. Only its SHA-256 digest is persisted. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Correlate limiter identifiers without retaining their plaintext value. */
export function identifierHash(value: string): string {
  return createHmac("sha256", subkey(appSecret(), "limiter")).update(value.trim().toLowerCase()).digest("hex");
}

// ---------------------------------------------------------------------------
// Join tickets: proof that a key was verified moments ago, so the join step
// (display name + avatar) doesn't need the raw key again. A ticket is bound
// to the key it was issued for: rotating the key invalidates it at once.
// ---------------------------------------------------------------------------

const TICKET_TTL_MS = 10 * 60 * 1000;

/** A short, non-secret fingerprint of the vault's current key verifier. */
export function keyTag(keyLookup: string): string {
  return keyLookup.slice(0, 16);
}

function ticketSignature(secret: string, body: string): string {
  return createHmac("sha256", subkey(secret, "join-ticket")).update(body).digest("base64url");
}

export function signJoinTicket(vaultId: string, keyLookup: string): string {
  const body = Buffer.from(
    JSON.stringify({ v: vaultId, k: keyTag(keyLookup), exp: Date.now() + TICKET_TTL_MS }),
  ).toString("base64url");
  return `${body}.${ticketSignature(appSecret(), body)}`;
}

export function verifyJoinTicket(ticket: string): { vaultId: string; keyTag: string } | null {
  const dot = ticket.lastIndexOf(".");
  if (dot < 0) return null;
  const body = ticket.slice(0, dot);
  const received = Buffer.from(ticket.slice(dot + 1));
  const valid = secrets().some((secret) => {
    const expected = Buffer.from(ticketSignature(secret, body));
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
  if (!valid) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof payload.v !== "string" || typeof payload.k !== "string" || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    return { vaultId: payload.v, keyTag: payload.k };
  } catch {
    return null;
  }
}

/** Constant-time comparison for bearer secrets such as CRON_SECRET. */
export function secretsMatch(received: string | null, expected: string): boolean {
  if (!received) return false;
  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
