import { WifiOff } from "lucide-react";
import { ButtonLink } from "@/components/ui";

export default function OfflinePage() {
  return (
    <main className="route-shell grid place-items-center text-center">
      <div><WifiOff className="mx-auto size-8 text-brass" /><h1 className="mt-4 font-display text-3xl text-starlight">The archive is offline.</h1><p className="mt-2 max-w-sm text-sm text-dim">Reconnect before adding or reading private content. Baul does not cache sensitive pages for offline use.</p><ButtonLink href="/vaults" className="mt-6">Retry</ButtonLink></div>
    </main>
  );
}
