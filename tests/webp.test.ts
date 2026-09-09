import { describe, expect, it } from "vitest";
import { webpDimensions } from "@/lib/webp";

function vp8x(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([..."RIFF"].map((char) => char.charCodeAt(0)), 0);
  bytes.set([..."WEBPVP8X"].map((char) => char.charCodeAt(0)), 8);
  const w = width - 1;
  const h = height - 1;
  bytes.set([w & 255, (w >> 8) & 255, (w >> 16) & 255], 24);
  bytes.set([h & 255, (h >> 8) & 255, (h >> 16) & 255], 27);
  return bytes;
}

describe("WebP validation", () => {
  it("reads extended WebP dimensions without decoding the image", () => {
    expect(webpDimensions(vp8x(256, 144))).toEqual({ width: 256, height: 144 });
  });

  it("rejects bytes that are not a WebP container", () => {
    expect(webpDimensions(new Uint8Array(30))).toBeNull();
  });
});
