/**
 * Give a country aggregate a small, stable display offset from its centroid.
 * The offset is derived only from the ISO code: it never uses a Baul id,
 * keeper location, or an individual creation event. Stable points also avoid
 * jumping around whenever React renders the globe again.
 */
export function approximateCountryPoint(
  iso3: string,
  latitude: number,
  longitude: number,
): { lat: number; lng: number } {
  let hash = 2166136261;
  for (const character of iso3.toUpperCase()) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  const unsigned = hash >>> 0;
  const angle = (unsigned % 360) * (Math.PI / 180);
  const distance = 0.18 + (((unsigned >>> 9) % 25) / 100);
  const lat = Math.max(-89.5, Math.min(89.5, latitude + Math.sin(angle) * distance));
  const longitudeScale = Math.max(0.35, Math.cos(latitude * (Math.PI / 180)));
  const shiftedLongitude = longitude + (Math.cos(angle) * distance) / longitudeScale;
  const lng = ((shiftedLongitude + 540) % 360) - 180;

  return { lat, lng };
}
