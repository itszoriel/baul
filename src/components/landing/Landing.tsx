"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Logo, LogoWordmark } from "@/components/Logo";
import { ButtonLink, Spinner, cn } from "@/components/ui";
import { BRAND, COPY, DEVELOPER } from "@/lib/copy";
import { approximateCountryPoint } from "@/lib/globe";
import type { CountryStat, RegionStat } from "@/lib/types";
import { currentVaults } from "@/lib/vault-client";
import type { GlobeStatPoint } from "./GlobeScene";

const GlobeScene = dynamic(() => import("./GlobeScene"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center">
      <Spinner className="size-6" />
    </div>
  ),
});

const nf = new Intl.NumberFormat("en-US");

function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${nf.format(n)} ${n === 1 ? singular : plural}`;
}

export default function Landing({
  regionStats,
  countryStats,
  configured,
}: {
  regionStats: RegionStat[];
  countryStats: CountryStat[];
  configured: boolean;
}) {
  const [activeStat, setActiveStat] = useState<GlobeStatPoint | null>(null);
  const [hasVaultSession, setHasVaultSession] = useState(false);
  const [globeReady, setGlobeReady] = useState(false);

  // This device may already hold a key session — offer the way back in.
  useEffect(() => {
    if (!configured) return;
    currentVaults().then((vaults) => setHasVaultSession(vaults.length > 0));
  }, [configured]);

  // The Three.js bundle is intentionally opt-in on mobile, reduced-motion,
  // and low-power devices. Desktop gets it shortly after the page settles.
  useEffect(() => {
    const device = navigator as Navigator & { deviceMemory?: number };
    const defer =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      window.matchMedia("(max-width: 700px)").matches ||
      (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4) ||
      (device.deviceMemory !== undefined && device.deviceMemory <= 4);
    if (defer) return;
    const timer = window.setTimeout(() => setGlobeReady(true), 700);
    return () => window.clearTimeout(timer);
  }, []);

  // World totals come from the WLD row so location-opted-out bauls count too.
  const totals = useMemo(() => {
    const world = countryStats.find((s) => s.iso3 === "WLD");
    return {
      vaults: world?.vault_count ?? 0,
      memories: world?.memory_count ?? 0,
      songs: world?.song_count ?? 0,
    };
  }, [countryStats]);

  // Dots: the finest charted division per branch (a division yields to its
  // charted children), plus country dots for countries with no charted
  // divisions. Country-only choices use a small stable, country-derived
  // display offset so the dot is approximate without inventing a real Baul
  // location or moving whenever the component renders.
  const points = useMemo<GlobeStatPoint[]>(() => {
    const charted = regionStats.filter((s) => s.lat != null && s.lng != null);
    const parentsOfCharted = new Set(charted.map((s) => s.parent_division_id).filter(Boolean));
    const countriesCharted = new Set(charted.map((s) => s.country_iso3));
    return [
      ...charted
        .filter((s) => !parentsOfCharted.has(s.division_id))
        .map((s) => ({ ...s, key: `d:${s.division_id}`, lat: s.lat!, lng: s.lng! })),
      ...countryStats
        .filter((s) => s.iso3 !== "WLD" && s.lat != null && s.lng != null && !countriesCharted.has(s.iso3))
        .map((s) => ({
          ...s,
          key: `c:${s.iso3}`,
          ...approximateCountryPoint(s.iso3, s.lat!, s.lng!),
        })),
    ];
  }, [regionStats, countryStats]);

  return (
    <main className="flex-1">
      {/* ------------------------------------------------ hero + globe */}
      <section className="relative h-[92svh] min-h-[560px] w-full overflow-hidden sm:h-svh">
        {globeReady ? (
          <GlobeScene points={points} onPointClick={setActiveStat} />
        ) : (
          <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden">
            <div className="aspect-square w-[min(78vw,42rem)] rounded-full border border-brass/20 bg-[radial-gradient(circle_at_38%_30%,rgba(226,211,164,.22),rgba(85,65,39,.12)_28%,rgba(15,18,28,.92)_67%)] shadow-[0_0_90px_rgba(184,139,67,.16),inset_-28px_-24px_70px_rgba(0,0,0,.7)]">
              <div className="size-full rounded-full bg-[repeating-linear-gradient(100deg,transparent_0_34px,rgba(216,189,120,.055)_35px_36px)] opacity-70" />
            </div>
          </div>
        )}

        {/* readability gradients — must not eat globe drags */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-night to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-night to-transparent" />

        {!configured && (
          <div className="absolute inset-x-0 top-0 z-20 bg-amber-500/15 px-4 py-2 text-center text-xs text-amber-200">
            Supabase isn&apos;t configured yet — the globe is empty. See the README to set up your env vars.
          </div>
        )}

        <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-4 sm:px-8 sm:py-5">
          <div className="pointer-events-auto">
            <LogoWordmark />
          </div>
          <div className="flex items-center gap-5">
            <p data-testid="global-totals" className="hidden text-sm text-dim md:block">
              <span className="text-brass-2">{count(totals.vaults, "baul")}</span> ·{" "}
              <span className="text-brass-2">{count(totals.memories, "memory", "memories")}</span> ·{" "}
              <span className="text-brass-2">{count(totals.songs, "song")}</span> kept
            </p>
            <ButtonLink href={hasVaultSession ? "/vaults" : "/enter"} className="pointer-events-auto" variant="ghost" size="sm">
              {hasVaultSession ? "Open my bauls" : COPY.enterCta}
            </ButtonLink>
          </div>
        </header>

        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-5 pb-4 text-center sm:px-6">
          <h1
            className="max-w-3xl font-display text-[2.45rem] font-semibold leading-[1.08] text-starlight sm:text-5xl md:text-6xl"
            style={{ textShadow: "0 2px 40px rgba(11,14,26,0.9)" }}
          >
            {BRAND.tagline}
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-6 text-dim sm:text-lg">
            A private treasure chest for two people — or your whole circle. Notes, photos, letters, and a shared
            soundtrack, protected by private keeper access.
          </p>
          <div className="pointer-events-auto mt-8 grid w-full max-w-xs grid-cols-2 gap-2.5 sm:mt-9 sm:flex sm:w-auto sm:max-w-none sm:flex-wrap sm:items-center sm:justify-center sm:gap-3">
            <ButtonLink href="/create" size="lg" className="w-full px-3 text-sm sm:w-auto sm:px-8 sm:text-base">{COPY.createCta}</ButtonLink>
            <ButtonLink href={hasVaultSession ? "/vaults" : "/enter"} variant="ghost" size="lg" className="w-full px-3 text-sm sm:w-auto sm:px-8 sm:text-base">
              {hasVaultSession ? "Open my bauls" : COPY.enterCta}
            </ButtonLink>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-4 z-10 flex justify-center px-4 text-center text-[11px] text-dim/80 sm:bottom-5 sm:text-xs">
          {!globeReady ? (
            <button type="button" onClick={() => setGlobeReady(true)} className="pointer-events-auto rounded-full border border-brass/25 bg-night/75 px-4 py-2 text-brass-2 transition hover:border-brass/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass">
              Explore the globe · {COPY.globePrivacy}
            </button>
          ) : (
            <p className="pointer-events-none">{globeReady ? "Drag to spin" : "Preparing the globe"} · {COPY.globePrivacy}</p>
          )}
        </div>

        {/* region detail card */}
        <AnimatePresence>
          {activeStat && (
            <motion.aside
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.25 }}
              className="glass absolute bottom-16 left-1/2 z-20 w-[min(92vw,340px)] -translate-x-1/2 rounded-2xl p-4 sm:left-8 sm:translate-x-0 sm:p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <h3 className="font-display text-lg text-starlight">{activeStat.name}</h3>
                <button
                  onClick={() => setActiveStat(null)}
                  className="cursor-pointer text-dim transition-colors hover:text-starlight"
                  aria-label="Close"
                >
                  <X className="size-4" />
                </button>
              </div>
              <p className="mt-1 text-3xl font-semibold text-brass-2">
                {nf.format(activeStat.vault_count)}{" "}
                <span className="text-base font-normal text-starlight">{activeStat.vault_count === 1 ? "baul" : "bauls"}</span>
              </p>
              <p className="mt-2 text-sm text-dim">
                {count(activeStat.duo_count, "baul")} for two · {count(activeStat.circle_count, "Circle Baul")}
              </p>
              <p className="text-sm text-dim">
                {count(activeStat.memory_count, "memory", "memories")} · {count(activeStat.song_count, "song")} kept
              </p>
              <p className="mt-3 text-xs text-dim/70">{COPY.globePrivacy}</p>
            </motion.aside>
          )}
        </AnimatePresence>
      </section>

      {/* ------------------------------------------------ what is a baul */}
      <Section>
        <div className="mx-auto grid max-w-5xl items-center gap-7 md:grid-cols-[auto_1fr] md:gap-10">
          <div className="glass lid-light mx-auto grid size-28 place-items-center rounded-3xl sm:size-40">
            <Logo size={64} />
          </div>
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-brass">{BRAND.pronunciation}</p>
            <h2 className="mt-3 font-display text-[1.75rem] leading-tight text-starlight sm:text-4xl">
              The chest at the foot of the bed, made digital.
            </h2>
            <p className="mt-4 max-w-2xl text-dim">
              In Filipino homes, the baul is where the precious things live — old letters, photographs, the dress
              worn once, the things you keep because they hold people. Baul brings that chest online: a private
              place you fill together, opened only by active keepers you invite or reclaim securely.
            </p>
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------ how it works */}
      <Section muted>
        <h2 className="text-center font-display text-[1.75rem] text-starlight sm:text-4xl">How it works</h2>
        <div className="mx-auto mt-7 grid max-w-5xl gap-3 sm:mt-12 sm:gap-6 md:grid-cols-3">
          {[
            {
              n: "01",
              title: "Forge a baul",
              body: "Name it, choose who it is for, and mint one permanent key. There is no signup form; Baul creates an anonymous keeper session for this browser.",
            },
            {
              n: "02",
              title: "Invite your keepers",
              body: "Send an expiring, one-time invitation. The permanent key stays off links, QR codes, email, analytics, and logs.",
            },
            {
              n: "03",
              title: "Fill it together",
              body: "Notes, photos, sealed letters that open on a future date, a soundtrack you build as one. It all stays in the chest.",
            },
          ].map((s) => (
            <div key={s.n} className="glass rounded-2xl p-5 sm:p-6">
              <p className="font-display text-sm text-brass">{s.n}</p>
              <h3 className="mt-2 font-display text-xl text-starlight">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-dim">{s.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------ two kinds */}
      <Section>
        <h2 className="text-center font-display text-[1.75rem] text-starlight sm:text-4xl">Two kinds of bauls</h2>
        <div className="mx-auto mt-7 grid max-w-4xl gap-3 sm:mt-12 sm:gap-6 md:grid-cols-2">
          <div data-vault-theme="intimate" className="glass rounded-2xl p-5 sm:rounded-3xl sm:p-8">
            <p className="accent-text font-display text-2xl font-semibold">A baul for two</p>
            <p className="mt-3 text-sm leading-relaxed text-dim">
              For couples. Add a meaningful date for days together, monthsaries, and anniversaries—or simply count
              the days since the Baul was made. Letters can stay sealed until the date you choose.
            </p>
            <div className="accent-fill mt-6 h-1 w-16 rounded-full" />
          </div>
          <div data-vault-theme="circle" className="glass rounded-2xl p-5 sm:rounded-3xl sm:p-8">
            <p className="accent-text font-display text-2xl font-semibold">Circle Baul</p>
            <p className="mt-3 text-sm leading-relaxed text-dim">
              For barkadas, families, and teams — up to fifty keepers. A shared board of memories, group chat, and
              milestones that celebrate how much you&apos;ve kept together.
            </p>
            <div className="accent-fill mt-6 h-1 w-16 rounded-full" />
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------ privacy */}
      <Section muted>
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-[1.75rem] text-starlight sm:text-4xl">Private by construction</h2>
          <ul className="mx-auto mt-6 max-w-xl space-y-3.5 text-left text-sm text-dim sm:mt-8 sm:space-y-4">
            {[
              "No public browsing, discovery, or search. Access requires a live keeper membership.",
              "We store only a verifier for the permanent key; it never appears in new links, email, analytics, or logs.",
              "Photos and songs live in private storage and are served through short-lived links.",
              "Baul is server-secured, not end-to-end encrypted. Authorized operators can technically access server-side content.",
              "The globe above shows delayed, approximate country and regional totals — never a real Baul coordinate, never a person.",
            ].map((line) => (
              <li key={line} className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brass" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* ------------------------------------------------ footer CTA */}
      <Section>
        <div className="mx-auto max-w-2xl text-center">
          <Logo size={44} />
          <h2 className="mt-5 font-display text-[1.75rem] text-starlight sm:text-4xl">Start keeping.</h2>
          <p className="mt-3 text-dim">It takes a minute to forge a baul. It holds a lifetime.</p>
          <div className="mx-auto mt-7 grid max-w-xs grid-cols-2 gap-2.5 sm:mt-8 sm:flex sm:max-w-none sm:flex-wrap sm:items-center sm:justify-center sm:gap-3">
            <ButtonLink href="/create" size="lg" className="w-full px-3 text-sm sm:w-auto sm:px-8 sm:text-base">{COPY.createCta}</ButtonLink>
            <ButtonLink href="/enter" variant="ghost" size="lg" className="w-full px-3 text-sm sm:w-auto sm:px-8 sm:text-base">{COPY.enterCta}</ButtonLink>
          </div>
        </div>
      </Section>

      <footer className="border-t border-white/5 px-6 py-8 text-center text-xs text-dim/70">
        <p>
          Designed and programmed by{" "}
          <a href={DEVELOPER.url} rel="me author" className="underline hover:text-starlight">
            {DEVELOPER.name} ({DEVELOPER.handle})
          </a>.
        </p>
        <p className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
          <Link href="/privacy" className="underline hover:text-starlight">Privacy</Link>
          <Link href="/terms" className="underline hover:text-starlight">Terms</Link>
          <Link href="/acceptable-use" className="underline hover:text-starlight">Acceptable use</Link>
          <Link href="/support" className="underline hover:text-starlight">Support</Link>
          <Link href="/recover" className="underline hover:text-starlight">Lost your key?</Link>
        </p>
      </footer>
    </main>
  );
}

function Section({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <section className={cn("px-4 py-14 sm:px-6 sm:py-24", muted && "bg-night-2/40")}>
      {children}
    </section>
  );
}
