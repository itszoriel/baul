/**
 * Minimal chest with a keyhole that doubles as a heart (spec §0).
 */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      {/* chest lid */}
      <path
        d="M4 13c0-4.4 5.4-7 12-7s12 2.6 12 7v1H4v-1z"
        fill="var(--brass, #C9A24B)"
        opacity="0.9"
      />
      {/* chest body */}
      <rect x="4" y="14" width="24" height="13" rx="2.5" fill="none" stroke="var(--brass, #C9A24B)" strokeWidth="2" />
      {/* heart keyhole */}
      <path
        d="M16 24.2s-3.2-2.1-3.2-4.15c0-1.15.9-1.95 1.85-1.95.55 0 1.05.3 1.35.75.3-.45.8-.75 1.35-.75.95 0 1.85.8 1.85 1.95 0 2.05-3.2 4.15-3.2 4.15z"
        fill="var(--brass-2, #E8C97A)"
      />
    </svg>
  );
}

export function LogoWordmark({ size = 26 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Logo size={size} />
      <span className="font-display text-xl font-semibold tracking-wide text-starlight">Baul</span>
    </span>
  );
}
