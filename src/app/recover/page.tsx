"use client";

import { motion } from "framer-motion";
import { KeyRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { TurnstileChallenge } from "@/components/TurnstileChallenge";
import { Button, ButtonLink, Field } from "@/components/ui";
import { COPY } from "@/lib/copy";
import { api, ApiRequestError } from "@/lib/vault-client";

/** "I lost my key" (spec §2.6): a NEW key is forged and emailed; old one dies. */
export default function RecoverPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ message: string }>("/api/keys/recovery-request", { email: email.trim(), turnstileToken });
      setMessage(res.message);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "CHALLENGE_REQUIRED") setChallenge(true);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

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
          className="w-full max-w-md text-center"
        >
          <p className="section-kicker">Recovery</p>
          <h1 className="mt-2 font-display text-[1.9rem] text-starlight sm:text-4xl">Forge a new key</h1>
          <p className="mt-3 text-sm leading-6 text-dim">{COPY.recoverExplainer}</p>

          {message ? (
            <div className="form-panel mt-6 p-5 sm:mt-8 sm:p-6">
              <KeyRound className="mx-auto size-6 text-brass" />
              <p className="mt-2 text-starlight">{message}</p>
              <p className="mt-3 text-xs text-dim">
                The current key still works. It changes only after the 30-minute, single-use link is confirmed.
              </p>
              <ButtonLink href="/" className="mt-5" variant="ghost">Return home</ButtonLink>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4 text-left sm:mt-8">
              <Field
                type="email"
                label="The baul's recovery email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
                error={error}
              />
              <Button type="submit" size="lg" className="w-full" disabled={busy || !email.trim()}>
                {busy ? "Sending…" : "Send confirmation link"}
              </Button>
              {challenge && <TurnstileChallenge onToken={setTurnstileToken} />}
            </form>
          )}
        </motion.div>
      </div>
    </main>
  );
}
