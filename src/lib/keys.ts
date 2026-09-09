import "server-only";

import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { LEGACY_PASSPHRASE_MIN, PASSPHRASE_MAX, PASSPHRASE_MIN } from "./passphrase-constants";

/**
 * Vault keys: `VLT-x7Kq-9mPa-2wNr-Tt4z` — 16 chars from a 54-char alphabet
 * (~92 bits of entropy), formatted for humans. Ambiguous glyphs (0/O, 1/l/I)
 * are excluded. The raw key is shown once and never stored: we keep a bcrypt
 * hash for verification plus a sha256 for O(1) lookup (see migration notes).
 */

const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
const GROUPS = 4;
const GROUP_LEN = 4;

export function generateVaultKey(): string {
  const chars: string[] = [];
  const needed = GROUPS * GROUP_LEN;
  while (chars.length < needed) {
    // Rejection sampling to avoid modulo bias (54 * 4 = 216).
    const bytes = randomBytes(needed * 2);
    for (const b of bytes) {
      if (b < 216) {
        const char = ALPHABET[b % ALPHABET.length];
        if (char) chars.push(char);
        if (chars.length === needed) break;
      }
    }
  }
  const groups: string[] = [];
  for (let i = 0; i < GROUPS; i++) {
    groups.push(chars.slice(i * GROUP_LEN, (i + 1) * GROUP_LEN).join(""));
  }
  return `VLT-${groups.join("-")}`;
}

/** Canonicalize user-typed keys: trim, unify dash variants, drop spaces. */
export function normalizeKey(input: string): string {
  return input.trim().replace(/[‐-―]/g, "-").replace(/\s+/g, "");
}

export function keyLookupHash(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function hashKey(key: string): Promise<string> {
  return bcrypt.hash(key, 12);
}

/** bcrypt.compare is constant-time over the derived digest. */
export async function verifyKey(key: string, hash: string): Promise<boolean> {
  return bcrypt.compare(key, hash);
}

// --- Personal passphrase (per-member, portable identity across devices) ----

export { LEGACY_PASSPHRASE_MIN, PASSPHRASE_MAX, PASSPHRASE_MIN };

/** Trim ends only — internal spaces can be intentional in a passphrase. */
export function normalizePassphrase(input: string): string {
  return input.trim();
}

export async function hashPassphrase(passphrase: string): Promise<string> {
  return bcrypt.hash(passphrase, 12);
}

export async function verifyPassphrase(passphrase: string, hash: string): Promise<boolean> {
  return bcrypt.compare(passphrase, hash);
}
