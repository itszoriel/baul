/** Read dimensions from the three WebP bitstream layouts without decoding. */
export function webpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (
    bytes.length < 30
    || ascii(bytes, 0, 4) !== 'RIFF'
    || ascii(bytes, 8, 12) !== 'WEBP'
  ) return null;

  const chunk = ascii(bytes, 12, 16);
  if (chunk === 'VP8X') {
    return {
      width: 1 + uint24le(bytes, 24),
      height: 1 + uint24le(bytes, 27),
    };
  }
  if (chunk === 'VP8 ' && bytes.length >= 30) {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    return {
      width: uint16le(bytes, 26) & 0x3fff,
      height: uint16le(bytes, 28) & 0x3fff,
    };
  }
  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const b1 = bytes[21] ?? 0;
    const b2 = bytes[22] ?? 0;
    const b3 = bytes[23] ?? 0;
    const b4 = bytes[24] ?? 0;
    return {
      width: 1 + (((b2 & 0x3f) << 8) | b1),
      height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)),
    };
  }
  return null;
}

// Chunks a canvas-encoded still WebP can contain. EXIF/XMP (metadata such as
// GPS), animation, and unknown chunks are refused rather than stored.
const ALLOWED_CHUNKS = new Set(["VP8 ", "VP8L", "VP8X", "ALPH", "ICCP"]);

export type WebpValidation =
  | { ok: true; width: number; height: number }
  | { ok: false; reason: "not_webp" | "malformed" | "metadata" | "unsupported_chunk" | "too_large" };

/**
 * Structural validation for uploaded WebP images. The browser re-encodes
 * images before upload; this check makes the server enforce the result
 * instead of trusting a client: exact RIFF length (no appended payload),
 * well-formed chunks, no metadata chunks, and bounded pixel dimensions (a
 * tiny file cannot decode into a huge bitmap on other keepers' devices).
 */
export function validateWebpImage(bytes: Uint8Array, maxDimension: number): WebpValidation {
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 12) !== "WEBP") {
    return { ok: false, reason: "not_webp" };
  }
  if (uint32le(bytes, 4) + 8 !== bytes.length) return { ok: false, reason: "malformed" };

  let offset = 12;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) return { ok: false, reason: "malformed" };
    const fourcc = ascii(bytes, offset, offset + 4);
    const size = uint32le(bytes, offset + 4);
    const next = offset + 8 + size + (size % 2);
    if (next > bytes.length) return { ok: false, reason: "malformed" };
    if (fourcc === "EXIF" || fourcc === "XMP ") return { ok: false, reason: "metadata" };
    if (!ALLOWED_CHUNKS.has(fourcc)) return { ok: false, reason: "unsupported_chunk" };
    offset = next;
  }

  const dimensions = webpDimensions(bytes);
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1) return { ok: false, reason: "malformed" };
  if (dimensions.width > maxDimension || dimensions.height > maxDimension) return { ok: false, reason: "too_large" };
  return { ok: true, ...dimensions };
}

function uint32le(bytes: Uint8Array, offset: number): number {
  return (uint24le(bytes, offset) + (bytes[offset + 3] ?? 0) * 0x1000000);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function uint16le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function uint24le(bytes: Uint8Array, offset: number): number {
  return uint16le(bytes, offset) | ((bytes[offset + 2] ?? 0) << 16);
}
