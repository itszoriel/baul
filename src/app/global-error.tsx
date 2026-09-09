"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="grid min-h-screen place-items-center bg-[#17130f] px-6 text-[#f8f0df]">
        <main className="max-w-md text-center">
          <h1 className="text-3xl">Baul could not open.</h1>
          <p className="mt-3 text-sm text-[#c7bda9]">Try refreshing. If this continues, contact support.</p>
        </main>
      </body>
    </html>
  );
}
