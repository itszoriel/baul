"use client";

import { AlertTriangle } from "lucide-react";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(JSON.stringify({ event: "client_error_boundary", digest: error.digest ?? null }));
    Sentry.captureException(error);
  }, [error]);
  return (
    <main className="route-shell grid place-items-center text-center">
      <div className="max-w-md" role="alert">
        <AlertTriangle className="mx-auto size-8 text-brass" />
        <h1 className="mt-4 font-display text-3xl text-starlight">The lid caught for a moment.</h1>
        <p className="mt-2 text-sm text-dim">Your content is still kept. Retry the page or return to your Baul shelf.</p>
        <div className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:justify-center sm:gap-3"><Button onClick={reset}>Try again</Button><ButtonLink href="/vaults" className="w-full" variant="ghost">Your Bauls</ButtonLink></div>
      </div>
    </main>
  );
}
