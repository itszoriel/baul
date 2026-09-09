/** Accept ID3-tagged MP3 files and MPEG audio frame-sync headers. */
export function isMp3(bytes: Uint8Array): boolean {
  if (bytes.length < 3) return false;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  return bytes[0] === 0xff && bytes[1] !== undefined && (bytes[1] & 0xe0) === 0xe0;
}

export function totalObjectBytes(headers: Headers): number | null {
  const contentRange = headers.get("content-range");
  const rangeMatch = contentRange?.match(/\/(\d+)$/);
  if (rangeMatch?.[1]) return Number(rangeMatch[1]);
  const contentLength = headers.get("content-length");
  return contentLength ? Number(contentLength) : null;
}
