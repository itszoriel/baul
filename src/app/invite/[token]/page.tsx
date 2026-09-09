"use client";

import { KeyRound, MailOpen } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { TurnstileChallenge } from "@/components/TurnstileChallenge";
import { Button, Field } from "@/components/ui";
import type { InviteRedeemResult } from "@/lib/domain";
import { LIMITS } from "@/lib/domain";
import { api, ApiRequestError, ensureAnonSession } from "@/lib/vault-client";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (passphrase !== confirm) return setError("The keeper phrases do not match.");
    setBusy(true);
    setError(null);
    try {
      await ensureAnonSession();
      const result = await api<InviteRedeemResult>("/api/invites/redeem", { token, displayName, passphrase, turnstileToken });
      localStorage.setItem("baul:last-vault-id", result.vault.id);
      router.replace(`/vault/${result.vault.id}`);
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.code === "CHALLENGE_REQUIRED") setChallenge(true);
      setError(cause instanceof Error ? cause.message : "This invitation could not be accepted.");
      setBusy(false);
    }
  }

  return (
    <main className="route-shell flex flex-col sm:px-6 sm:py-6">
      <Logo size={34} />
      <div className="mx-auto flex w-full max-w-md flex-1 items-start py-10 sm:grid sm:place-items-center sm:py-8">
        <form onSubmit={submit} className="form-panel w-full p-5 sm:p-8">
          <MailOpen className="size-7 text-brass" />
          <p className="section-kicker mt-4">One-time invitation</p>
          <h1 className="mt-1 font-display text-[1.9rem] leading-tight text-starlight sm:text-3xl">Accept your invitation.</h1>
          <p className="mt-2 text-sm leading-6 text-dim">This one-time link opens the shared Baul. Your keeper phrase is personal—it identifies only you and should never be shared.</p>
          <div className="mt-7 space-y-4">
            <Field label="Keeper name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={LIMITS.displayName} />
            <Field label="Personal keeper phrase" type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} minLength={LIMITS.keeperPhraseMin} maxLength={LIMITS.keeperPhraseMax} autoComplete="new-password" />
            <Field label="Repeat keeper phrase" type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} error={error} autoComplete="new-password" />
          </div>
          <Button className="mt-6 w-full" size="lg" disabled={busy || !displayName.trim() || passphrase.length < LIMITS.keeperPhraseMin || passphrase !== confirm}>
            <KeyRound className="size-4" /> {busy ? "Opening…" : "Become a keeper"}
          </Button>
          {challenge && <div className="mt-4"><TurnstileChallenge onToken={setTurnstileToken} /></div>}
        </form>
      </div>
    </main>
  );
}
