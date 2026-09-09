"use client";

import { Archive, KeyRound, Plus, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { ButtonLink, Spinner } from "@/components/ui";
import type { VaultSummary } from "@/lib/domain";
import { currentVaults, ensureAnonSession } from "@/lib/vault-client";

export default function VaultPickerPage() {
  const [vaults, setVaults] = useState<VaultSummary[] | null>(null);

  useEffect(() => {
    ensureAnonSession()
      .then(currentVaults)
      .then(setVaults)
      .catch(() => setVaults([]));
  }, []);

  return (
    <main className="route-shell bg-[radial-gradient(circle_at_top,rgba(184,139,67,.1),transparent_36%)] sm:px-8 sm:py-6">
      <header className="mx-auto flex max-w-5xl items-center justify-between">
        <Link href="/" aria-label="Baul home"><Logo size={34} /></Link>
        <ButtonLink href="/create" size="sm"><Plus className="size-4" /> New Baul</ButtonLink>
      </header>

      <section className="mx-auto max-w-5xl py-10 sm:py-20">
        <p className="section-kicker">Your archive</p>
        <h1 className="mt-2 font-display text-[2rem] leading-tight text-starlight sm:mt-3 sm:text-5xl">Choose a Baul to open.</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-dim">
          One anonymous keeper session can belong to several Bauls. Each chest keeps its own members, memories, and permanent key.
        </p>

        {vaults === null ? (
          <div className="grid min-h-52 place-items-center"><Spinner className="size-6" /></div>
        ) : vaults.length === 0 ? (
          <div className="form-panel mt-7 p-5 sm:mt-10 sm:p-8">
            <Archive className="size-7 text-brass" />
            <h2 className="mt-4 font-display text-2xl text-starlight">No Bauls on this browser yet.</h2>
            <p className="mt-2 text-sm text-dim">Enter a permanent key, accept an invitation, or begin a new chest.</p>
            <div className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
              <ButtonLink href="/enter" className="w-full"><KeyRound className="size-4" /> Enter a key</ButtonLink>
              <ButtonLink href="/create" className="w-full" variant="ghost">Create a Baul</ButtonLink>
            </div>
          </div>
        ) : (
          <div className="mt-7 grid gap-3 sm:mt-10 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {vaults.map((vault) => (
              <Link
                key={vault.id}
                href={`/vault/${vault.id}`}
                onClick={() => localStorage.setItem("baul:last-vault-id", vault.id)}
                className="group rounded-2xl border border-brass/20 bg-[#251f18]/90 p-4 shadow-[0_16px_50px_rgba(0,0,0,.18)] transition hover:-translate-y-0.5 hover:border-brass/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-full border border-brass/25 bg-brass/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-brass-2">{vault.role}</span>
                  <span className="flex items-center gap-1 text-xs text-dim"><Users className="size-3.5" /> {vault.memberCount}</span>
                </div>
                <h2 className="mt-4 font-display text-[1.35rem] text-starlight transition group-hover:text-brass-2 sm:mt-5 sm:text-2xl">{vault.name}</h2>
                <p className="mt-1 text-sm text-dim">You are {vault.displayName}</p>
                <p className="mt-5 text-xs text-dim/70">Made {new Date(vault.createdAt).toLocaleDateString()}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
