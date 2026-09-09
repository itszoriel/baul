import { ArchiveX } from "lucide-react";
import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="route-shell grid place-items-center text-center">
      <div><ArchiveX className="mx-auto size-8 text-brass" /><h1 className="mt-4 font-display text-3xl text-starlight">Nothing is kept here.</h1><p className="mt-2 text-sm text-dim">The page may have moved, expired, or never existed.</p><ButtonLink href="/" className="mt-6">Return to Baul</ButtonLink></div>
    </main>
  );
}
