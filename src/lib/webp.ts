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

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function uint16le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function uint24le(bytes: Uint8Array, offset: number): number {
  return uint16le(bytes, offset) | ((bytes[offset + 2] ?? 0) << 16);
}
