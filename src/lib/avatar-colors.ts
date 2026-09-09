/** Fallback avatar palette — warm, readable on the dark cosmic theme. */
export const AVATAR_COLORS = [
  "#F27D9D", // rose
  "#FFB86B", // amber
  "#8B7CF6", // violet
  "#4FD1C5", // teal
  "#F6C177", // honey
  "#7AA2F7", // periwinkle
  "#95D5A0", // sage
  "#E8918C", // coral
  "#C4A7E7", // lilac
  "#6FC3DF", // sky
  "#E0AF68", // brass
  "#F2A7C3", // blush
] as const;

export function pickAvatarColor(taken: string[]): string {
  const free = AVATAR_COLORS.filter((c) => !taken.includes(c));
  const pool = free.length > 0 ? free : AVATAR_COLORS;
  return pool[Math.floor(Math.random() * pool.length)] ?? AVATAR_COLORS[0];
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
