import "server-only";

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { appSecret } from "./env";

/**
 * At-rest encryption for recovery emails (AES-256-GCM) plus an HMAC blind
 * index so "I lost my key" can locate vaults without ever storing the
 * plaintext address. Also signs short-lived join tickets so the key only has
 * to be bcrypt-verified once per entry flow.
 */

function aesKey(): Buffer {
  return createHash("sha256").update(appSecret()).digest();
}

export function encryptEmail(email: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey(), iv);
  const enc = Buffer.concat([cipher.update(email, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

export function decryptEmail(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Invalid encrypted email payload.");
  const decipher = createDecipheriv("aes-256-gcm", aesKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

export function emailBlindIndex(email: string): string {
  return createHmac("sha256", appSecret()).update(email.trim().toLowerCase()).digest("hex");
}

/** A 256-bit URL-safe secret. Only its SHA-256 digest is persisted. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Correlate limiter identifiers without retaining their plaintext value. */
export function identifierHash(value: string): string {
  return createHmac("sha256", appSecret()).update(value.trim().toLowerCase()).digest("hex");
}

// ---------------------------------------------------------------------------
// Join tickets: proof that a key was verified moments ago, so the join step
// (display name + avatar) doesn't need the raw key again.
// ---------------------------------------------------------------------------

const TICKET_TTL_MS = 10 * 60 * 1000;

export function signJoinTicket(vaultId: string): string {
  const body = Buffer.from(JSON.stringify({ v: vaultId, exp: Date.now() + TICKET_TTL_MS })).toString("base64url");
  const sig = createHmac("sha256", appSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyJoinTicket(ticket: string): { vaultId: string } | null {
  const dot = ticket.lastIndexOf(".");
  if (dot < 0) return null;
  const body = ticket.slice(0, dot);
  const sig = ticket.slice(dot + 1);
  const expected = createHmac("sha256", appSecret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof payload.v !== "string" || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    return { vaultId: payload.v };
  } catch {
    return null;
  }
}
