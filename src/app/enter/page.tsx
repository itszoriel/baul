"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useState } from "react";
import { IdentitySetup } from "@/components/IdentitySetup";
import { Logo } from "@/components/Logo";
import { ReclaimForm } from "@/components/ReclaimForm";
import { TurnstileChallenge } from "@/components/TurnstileChallenge";
import { Button, Field, cn } from "@/components/ui";
import { COPY } from "@/lib/copy";
import type { VaultType } from "@/lib/types";
import { api, ApiRequestError, joinVault } from "@/lib/vault-client";

/**
 * Vault entry (spec §2.2): key → verify → returning members go straight in;
 * first-timers set up identity. Keys arrive typed, pasted, or via the
 * a short legacy query-key compatibility window.
 */

interface Verified {
  joinToken: string;
  vault: {
    name: string;
    vaultType: VaultType;
    memberCount: number;
    maxMembers: number;
    isFull: boolean;
    alreadyMember: boolean;
  };
}

export default function EnterPage() {
  return <EnterFlow />;
}

function EnterFlow() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [verified, setVerified] = useState<Verified | null>(null);
  // "new" = create a keeper here; "returning" = reclaim one from another device.
  const [mode, setMode] = useState<"new" | "returning">("new");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  async function verify(candidate: string) {
    if (busy || !candidate.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<Verified>("/api/keys/verify", { key: candidate.trim(), turnstileToken });
      if (result.vault.alreadyMember) {
        // This device already holds a seat — bind claims and go straight in.
        const joined = await joinVault(result.joinToken, undefined, undefined, turnstileToken);
        localStorage.setItem("baul:last-vault-id", joined.vault.id);
        router.push(`/vault/${joined.vault.id}`);
        return;
      }
      // A full baul can't take NEW keepers, but a returning keeper can still
      // reclaim their existing seat from a new device — so land on that form.
      setMode(result.vault.isFull ? "returning" : "new");
      setVerified(result);
      setBusy(false);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "CHALLENGE_REQUIRED") setChallenge(true);
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  // A QR scan lands here with the key in the URL — verify it immediately.
  useLayoutEffect(() => {
    const autoKey = new URL(window.location.href).searchParams.get("key");
    if (!autoKey) return;
    window.history.replaceState(null, "", "/enter");
    const cutoff = Date.parse(process.env.NEXT_PUBLIC_LEGACY_QUERY_KEY_CUTOFF ?? "2026-09-30T00:00:00Z");
    queueMicrotask(() => {
      if (Date.now() > cutoff) {
        setError("For your privacy, old key links are no longer accepted. Paste the permanent key manually.");
        return;
      }
      setKey(autoKey);
      void verify(autoKey);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="route-shell flex flex-col sm:px-6 sm:py-6">
      <header>
        <Link href="/" aria-label="Back to the globe">
          <Logo size={34} />
        </Link>
      </header>

      <div className="flex flex-1 items-start justify-center py-10 sm:items-center sm:py-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          {!verified ? (
            <div className="text-center">
              <p className="section-kicker">Permanent Baul key</p>
              <h1 className="mt-2 font-display text-[1.9rem] text-starlight sm:text-4xl">{COPY.enterTitle}</h1>
              <p className="mt-2 text-sm leading-6 text-dim">Paste the permanent Baul key manually. Personal keeper phrases do not open this door.</p>
              <form
                className="mt-6 space-y-4 text-left sm:mt-8"
                onSubmit={(e) => {
                  e.preventDefault();
                  verify(key);
                }}
              >
                <Field
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="VLT-xxxx-xxxx-xxxx-xxxx"
                  className="font-mono tracking-wide"
                  autoFocus
                  error={error}
                  aria-label="Your baul key"
                />
                <Button type="submit" size="lg" className="w-full" disabled={busy || !key.trim()}>
                  {busy ? "Trying the lock…" : "Open the baul"}
                </Button>
                {challenge && <TurnstileChallenge onToken={setTurnstileToken} />}
              </form>
              <p className="mt-6 text-sm text-dim">
                Lost your key?{" "}
                <Link href="/recover" className="underline hover:text-starlight">
                  We can forge a new one.
                </Link>
              </p>
            </div>
          ) : (
            <div className="form-panel p-5 sm:p-8" data-vault-theme={verified.vault.vaultType}>
              <p className="text-sm text-dim">
                The key turns. Inside:{" "}
                <span className="accent-text font-display text-base">{verified.vault.name}</span> ·{" "}
                {verified.vault.memberCount} of {verified.vault.maxMembers} keepers inside
              </p>

              {/* Toggle: create a new keeper here vs. reclaim one from another
                  device. A returning keeper is always allowed; a new one only
                  when there's a free seat. */}
              {verified.vault.memberCount > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-black/15 p-1 text-sm">
                  <button
                    onClick={() => setMode("new")}
                    disabled={verified.vault.isFull}
                    className={cn(
                      "min-h-11 cursor-pointer rounded-lg px-3 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                      mode === "new" ? "accent-fill font-medium text-night" : "text-dim hover:text-starlight",
                    )}
                  >
                    I&apos;m new here
                  </button>
                  <button
                    onClick={() => setMode("returning")}
                    className={cn(
                      "min-h-11 cursor-pointer rounded-lg px-3 py-2 transition-colors",
                      mode === "returning" ? "accent-fill font-medium text-night" : "text-dim hover:text-starlight",
                    )}
                  >
                    I&apos;ve been here
                  </button>
                </div>
              )}

              {verified.vault.isFull && mode === "returning" && (
                <p className="mt-3 text-xs text-amber-300/90">
                  This baul is full, so only a returning keeper can enter — sign in with your username and passphrase.
                </p>
              )}

              <div className="mt-5">
                {mode === "new" ? (
                  <IdentitySetup
                    joinToken={verified.joinToken}
                    vaultName={verified.vault.name}
                    vaultType={verified.vault.vaultType}
                  />
                ) : (
                  <ReclaimForm joinToken={verified.joinToken} vaultType={verified.vault.vaultType} />
                )}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </main>
  );
}
