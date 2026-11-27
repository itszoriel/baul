import { describe, expect, it } from "vitest";
import { validateWebpImage, webpDimensions } from "@/lib/webp";

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

function vp8x(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set(ascii("RIFF"), 0);
  bytes.set(ascii("WEBPVP8X"), 8);
  const w = width - 1;
  const h = height - 1;
  bytes.set([w & 255, (w >> 8) & 255, (w >> 16) & 255], 24);
  bytes.set([h & 255, (h >> 8) & 255, (h >> 16) & 255], 27);
  return bytes;
}

function chunk(fourcc: string, payload: number[]): number[] {
  const size = payload.length;
  return [...ascii(fourcc), size & 255, (size >> 8) & 255, (size >> 16) & 255, (size >>> 24) & 255, ...payload, ...(size % 2 ? [0] : [])];
}

/** A structurally valid still WebP: VP8X header plus the given extra chunks. */
function webp(width: number, height: number, extra: number[][] = []): Uint8Array {
  const w = width - 1;
  const h = height - 1;
  const header = chunk("VP8X", [0, 0, 0, 0, w & 255, (w >> 8) & 255, (w >> 16) & 255, h & 255, (h >> 8) & 255, (h >> 16) & 255]);
  const body = [...ascii("WEBP"), ...header, ...extra.flat(), ...chunk("VP8 ", [1, 2, 3, 4])];
  const size = body.length;
  return new Uint8Array([...ascii("RIFF"), size & 255, (size >> 8) & 255, (size >> 16) & 255, (size >>> 24) & 255, ...body]);
}

describe("WebP dimensions", () => {
  it("reads extended WebP dimensions without decoding the image", () => {
    expect(webpDimensions(vp8x(256, 144))).toEqual({ width: 256, height: 144 });
  });

  it("rejects bytes that are not a WebP container", () => {
    expect(webpDimensions(new Uint8Array(30))).toBeNull();
  });
});

describe("validateWebpImage", () => {
  it("accepts a well-formed still image within bounds", () => {
    expect(validateWebpImage(webp(512, 512), 512)).toEqual({ ok: true, width: 512, height: 512 });
  });

  it("accepts a colour profile chunk", () => {
    expect(validateWebpImage(webp(100, 80, [chunk("ICCP", [1, 2, 3])]), 512).ok).toBe(true);
  });

  it("refuses EXIF and XMP metadata such as GPS location", () => {
    expect(validateWebpImage(webp(100, 100, [chunk("EXIF", [1, 2, 3, 4])]), 512)).toEqual({ ok: false, reason: "metadata" });
    expect(validateWebpImage(webp(100, 100, [chunk("XMP ", [1, 2])]), 512)).toEqual({ ok: false, reason: "metadata" });
  });

  it("refuses dimensions that would decode into an oversized bitmap", () => {
    expect(validateWebpImage(webp(16_000, 16_000), 2048)).toEqual({ ok: false, reason: "too_large" });
  });

  it("refuses data appended after the RIFF container", () => {
    const image = webp(10, 10);
    const polyglot = new Uint8Array([...image, ...ascii("<script>")]);
    expect(validateWebpImage(polyglot, 512)).toEqual({ ok: false, reason: "malformed" });
  });

  it("refuses animation and unknown chunks", () => {
    expect(validateWebpImage(webp(10, 10, [chunk("ANIM", [0, 0, 0, 0, 0, 0])]), 512)).toEqual({ ok: false, reason: "unsupported_chunk" });
    expect(validateWebpImage(webp(10, 10, [chunk("ZZZZ", [1])]), 512)).toEqual({ ok: false, reason: "unsupported_chunk" });
  });

  it("refuses a chunk that claims to run past the end of the file", () => {
    const image = webp(10, 10);
    image[16] = 0xff; // VP8X chunk size
    expect(validateWebpImage(image, 512)).toEqual({ ok: false, reason: "malformed" });
  });

  it("refuses non-WebP bytes", () => {
    expect(validateWebpImage(new Uint8Array(64), 512)).toEqual({ ok: false, reason: "not_webp" });
  });
});
