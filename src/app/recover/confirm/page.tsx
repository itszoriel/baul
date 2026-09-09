"use client";

import { Check, Copy, KeyRound } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { TurnstileChallenge } from "@/components/TurnstileChallenge";
import { Button, Spinner } from "@/components/ui";
import type { RecoveryConfirmResult } from "@/lib/domain";
import { api, ApiRequestError } from "@/lib/vault-client";

export default function RecoveryConfirmPage() {
  return <Suspense fallback={<main className="grid min-h-svh place-items-center"><Spinner /></main>}><RecoveryConfirm /></Suspense>;
}

function RecoveryConfirm() {
  const params = useSearchParams();
  const [token] = useState(() => params.get("token") ?? "");
  const [result, setResult] = useState<RecoveryConfirmResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [challenge, setChallenge] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  useEffect(() => {
    if (token) window.history.replaceState(null, "", "/recover/confirm");
  }, [token]);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      setResult(await api<RecoveryConfirmResult>("/api/keys/recovery-confirm", { token, turnstileToken }));
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.code === "CHALLENGE_REQUIRED") setChallenge(true);
      setError(cause instanceof Error ? cause.message : "This recovery link is invalid or expired.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="route-shell flex flex-col sm:px-6 sm:py-6">
      <Link href="/"><Logo size={34} /></Link>
      <div className="mx-auto flex w-full max-w-md flex-1 items-start py-10 sm:grid sm:place-items-center sm:py-8">
        <div className="form-panel w-full p-5 text-center sm:p-8">
          <KeyRound className="mx-auto size-7 text-brass" />
          {result ? (
            <>
              <h1 className="mt-4 font-display text-3xl text-starlight">Your new permanent key</h1>
              <p className="mt-2 text-sm text-dim">The old key to {result.vault.name} no longer works. This value is shown once.</p>
              <p className="mt-6 break-all rounded-xl border border-brass/30 bg-black/20 p-4 font-mono text-lg text-brass-2">{result.key}</p>
              <Button className="mt-4 w-full" onClick={async () => { await navigator.clipboard.writeText(result.key); setCopied(true); }}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy key"}
              </Button>
              <Link href="/enter" className="mt-4 inline-block text-sm text-dim underline">Enter it manually</Link>
            </>
          ) : (
            <>
              <h1 className="mt-4 font-display text-3xl text-starlight">Replace the permanent key?</h1>
              <p className="mt-2 text-sm leading-6 text-dim">Confirmation immediately retires the current key and reveals a replacement once. Existing keeper memberships remain active.</p>
              {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
              {challenge && <div className="mt-4 text-left"><TurnstileChallenge onToken={setTurnstileToken} /></div>}
              <Button className="mt-6 w-full" size="lg" onClick={confirm} disabled={busy || !token}>{busy ? "Forging…" : "Confirm and forge key"}</Button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
