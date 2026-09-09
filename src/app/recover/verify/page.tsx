"use client";

import { CheckCircle2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { Button, ButtonLink, Spinner } from "@/components/ui";
import { api } from "@/lib/vault-client";

export default function VerifyRecoveryEmailPage() {
  return <Suspense fallback={<main className="grid min-h-svh place-items-center"><Spinner /></main>}><VerifyRecoveryEmail /></Suspense>;
}

function VerifyRecoveryEmail() {
  const params = useSearchParams();
  const [token] = useState(() => params.get("token") ?? "");
  const [state, setState] = useState<"ready" | "busy" | "done" | "error">("ready");
  useEffect(() => { if (token) window.history.replaceState(null, "", "/recover/verify"); }, [token]);
  async function confirm() {
    setState("busy");
    try { await api("/api/keys/recovery-email-confirm", { token }); setState("done"); }
    catch { setState("error"); }
  }
  return (
    <main className="route-shell flex flex-col sm:px-6 sm:py-6">
      <Link href="/"><Logo size={34} /></Link>
      <div className="mx-auto flex w-full max-w-md flex-1 items-start py-10 text-center sm:grid sm:place-items-center sm:py-8">
        <div className="form-panel w-full p-5 sm:p-7">
          {state === "done" ? <CheckCircle2 className="mx-auto size-8 text-emerald-300" /> : <MailCheck className="mx-auto size-8 text-brass" />}
          <h1 className="mt-4 font-display text-3xl text-starlight">{state === "done" ? "Recovery email confirmed." : "Confirm this recovery email."}</h1>
          <p className="mt-2 text-sm text-dim">{state === "done" ? "This address can now receive a secure recovery link. No permanent key was sent or changed." : "This verifies delivery only. It does not reveal or rotate the permanent key."}</p>
          {state === "error" && <p role="alert" className="mt-4 text-sm text-red-300">This link is invalid or expired.</p>}
          {state === "done" ? <ButtonLink href="/vaults" className="mt-6">Your Bauls</ButtonLink> : <Button className="mt-6 w-full" onClick={confirm} disabled={!token || state === "busy"}>{state === "busy" ? "Confirming…" : "Confirm email"}</Button>}
        </div>
      </div>
    </main>
  );
}
