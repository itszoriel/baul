import { createCipheriv, createHash, createHmac, randomBytes } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decryptEmail,
  emailBlindIndex,
  emailBlindIndexCandidates,
  encryptEmail,
  secretsMatch,
  signJoinTicket,
  verifyJoinTicket,
} from "@/lib/crypto";

const OLD = "old-secret-old-secret-old-secret-0001";
const NEW = "new-secret-new-secret-new-secret-0002";
const LOOKUP = "a".repeat(64);
const VAULT = "10000000-0000-0000-0000-000000000001";

/** The pre-v2 format: AES key = SHA-256(APP_SECRET), three dot-separated parts. */
function legacyEncrypt(email: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), iv);
  const data = Buffer.concat([cipher.update(email, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${data.toString("base64")}`;
}

beforeEach(() => vi.stubEnv("APP_SECRET", OLD));
afterEach(() => vi.unstubAllEnvs());

describe("recovery email encryption", () => {
  it("round-trips the current versioned format", () => {
    const payload = encryptEmail("keeper@example.test");
    expect(payload.startsWith("v2.")).toBe(true);
    expect(decryptEmail(payload)).toEqual({ email: "keeper@example.test", current: true });
  });

  it("still reads legacy payloads and marks them for re-keying", () => {
    expect(decryptEmail(legacyEncrypt("keeper@example.test", OLD))).toEqual({ email: "keeper@example.test", current: false });
  });

  it("reads values from the previous secret during a rotation", () => {
    const written = encryptEmail("keeper@example.test");
    vi.stubEnv("APP_SECRET", NEW);
    vi.stubEnv("APP_SECRET_PREVIOUS", OLD);
    expect(decryptEmail(written)).toEqual({ email: "keeper@example.test", current: false });
  });

  it("fails closed when no configured secret matches", () => {
    const written = encryptEmail("keeper@example.test");
    vi.stubEnv("APP_SECRET", NEW);
    expect(() => decryptEmail(written)).toThrow();
  });
});

describe("recovery email blind index", () => {
  it("normalizes case and whitespace", () => {
    expect(emailBlindIndex(" Keeper@Example.test ")).toBe(emailBlindIndex("keeper@example.test"));
  });

  it("matches vaults indexed under the legacy and previous secrets", () => {
    const legacy = createHmac("sha256", OLD).update("keeper@example.test").digest("hex");
    const previous = emailBlindIndex("keeper@example.test");
    vi.stubEnv("APP_SECRET", NEW);
    vi.stubEnv("APP_SECRET_PREVIOUS", OLD);
    const candidates = emailBlindIndexCandidates("keeper@example.test");
    expect(candidates).toContain(legacy);
    expect(candidates).toContain(previous);
    expect(candidates).toContain(emailBlindIndex("keeper@example.test"));
  });
});

describe("join tickets", () => {
  it("carries the vault and a fingerprint of the key it was issued for", () => {
    expect(verifyJoinTicket(signJoinTicket(VAULT, LOOKUP))).toEqual({ vaultId: VAULT, keyTag: LOOKUP.slice(0, 16) });
  });

  it("rejects a tampered ticket", () => {
    const ticket = signJoinTicket(VAULT, LOOKUP);
    const [body, signature] = ticket.split(".");
    const forged = Buffer.from(JSON.stringify({ v: VAULT, k: "b".repeat(16), exp: Date.now() + 60_000 })).toString("base64url");
    expect(verifyJoinTicket(`${forged}.${signature}`)).toBeNull();
    expect(verifyJoinTicket(`${body}.x${signature}`)).toBeNull();
  });

  it("accepts tickets signed with the previous secret during a rotation", () => {
    const ticket = signJoinTicket(VAULT, LOOKUP);
    vi.stubEnv("APP_SECRET", NEW);
    vi.stubEnv("APP_SECRET_PREVIOUS", OLD);
    expect(verifyJoinTicket(ticket)?.vaultId).toBe(VAULT);
  });

  it("expires after ten minutes", () => {
    vi.useFakeTimers();
    try {
      const ticket = signJoinTicket(VAULT, LOOKUP);
      vi.advanceTimersByTime(10 * 60 * 1000 + 1);
      expect(verifyJoinTicket(ticket)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("secretsMatch", () => {
  it("compares bearer secrets exactly", () => {
    expect(secretsMatch("Bearer abc", "Bearer abc")).toBe(true);
    expect(secretsMatch("Bearer abd", "Bearer abc")).toBe(false);
    expect(secretsMatch(null, "Bearer abc")).toBe(false);
  });
});
