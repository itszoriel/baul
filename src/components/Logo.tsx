import Image from "next/image";

/** The woven B-shaped Baul chest supplied by the project owner. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <Image
      src="/baul-logo.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      sizes={`${size}px`}
      className="shrink-0 object-contain"
    />
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
