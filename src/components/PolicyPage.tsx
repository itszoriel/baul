import Link from "next/link";
import { LogoWordmark } from "@/components/Logo";

export function PolicyPage({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <main className="route-shell">
      <header className="mx-auto flex max-w-3xl items-center justify-between">
        <Link href="/" aria-label="Baul home"><LogoWordmark /></Link>
        <Link href="/support" className="min-h-11 rounded-full px-4 py-3 text-sm text-brass-2 hover:bg-white/5">Support</Link>
      </header>
      <article className="mx-auto max-w-3xl py-12 sm:py-20">
        <p className="section-kicker">Baul beta</p>
        <h1 className="mt-3 font-display text-4xl text-starlight sm:text-5xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-dim">{summary}</p>
        <div className="mt-10 space-y-8 text-sm leading-7 text-dim [&_a]:text-brass-2 [&_a]:underline [&_h2]:font-display [&_h2]:text-2xl [&_h2]:text-starlight [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
          {children}
        </div>
        <p className="mt-12 border-t border-white/10 pt-6 text-xs text-dim/70">
          Last updated 9 September 2026 · Designed and programmed by Paul John E. Antigo.
        </p>
      </article>
    </main>
  );
}
