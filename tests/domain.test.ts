import { beforeAll, describe, expect, it, vi } from "vitest";
import { generateOpaqueToken, tokenHash } from "@/lib/crypto";
import { keeperPhraseSchema, legacyKeeperPhraseSchema, stickerNameSchema } from "@/lib/domain";
import { generateVaultKey, keyLookupHash, normalizeKey } from "@/lib/keys";
import { classifySongUrl, youtubeId } from "@/lib/youtube";

beforeAll(() => {
  vi.stubEnv("APP_SECRET", "test-secret-that-is-at-least-thirty-two-characters");
});

describe("permanent keys", () => {
  it("normalizes whitespace and Unicode dashes", () => {
    expect(normalizeKey("  VLT-abcd–EFGH-2345-6789 \n")).toBe("VLT-abcd-EFGH-2345-6789");
  });

  it("generates human-readable high-entropy key shapes and stable lookup hashes", () => {
    const key = generateVaultKey();
    expect(key).toMatch(/^VLT-[a-zA-Z2-9]{4}(?:-[a-zA-Z2-9]{4}){3}$/);
    expect(keyLookupHash(key)).toMatch(/^[a-f0-9]{64}$/);
    expect(keyLookupHash(key)).toBe(keyLookupHash(key));
  });
});

describe("one-time token material", () => {
  it("generates 256-bit URL-safe tokens and stores only deterministic digests", () => {
    const first = generateOpaqueToken();
    const second = generateOpaqueToken();
    expect(first).toHaveLength(43);
    expect(first).not.toBe(second);
    expect(tokenHash(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenHash(first)).not.toContain(first);
  });
});

describe("keeper phrases", () => {
  it("requires ten characters for new phrases while accepting legacy input for reclaim", () => {
    expect(keeperPhraseSchema.safeParse("123456789").success).toBe(false);
    expect(keeperPhraseSchema.safeParse("1234567890").success).toBe(true);
    expect(legacyKeeperPhraseSchema.safeParse("12345").success).toBe(false);
    expect(legacyKeeperPhraseSchema.safeParse("123456").success).toBe(true);
  });
});

describe("custom sticker names", () => {
  it("accepts friendly names but rejects markup and path-like values", () => {
    expect(stickerNameSchema.safeParse("kilig face").success).toBe(true);
    expect(stickerNameSchema.safeParse("inside-joke_2").success).toBe(true);
    expect(stickerNameSchema.safeParse("<img onerror=alert(1)>").success).toBe(false);
    expect(stickerNameSchema.safeParse("../sticker").success).toBe(false);
  });
});

describe("song URL safety", () => {
  it("accepts HTTPS YouTube and direct audio sources only", () => {
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://evil.example/?next=youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(youtubeId("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(youtubeId("http://youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(classifySongUrl("https://cdn.example.test/song.mp3")).toBe("audio");
    expect(classifySongUrl("http://cdn.example.test/song.mp3")).toBe("unsupported");
    expect(classifySongUrl("https://example.test/page")).toBe("unsupported");
  });
});
