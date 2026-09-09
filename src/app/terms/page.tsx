import type { Metadata } from "next";
import { PolicyPage } from "@/components/PolicyPage";

export const metadata: Metadata = { title: "Beta terms · Baul", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return (
    <PolicyPage title="Beta terms" summary="Plain-language operating terms for the personal, non-commercial Baul beta.">
      <section><h2>Beta service</h2><p>Baul is an experimental personal project provided without a promise of uninterrupted availability. Features, limits, and stored formats may change while the beta is evaluated.</p></section>
      <section><h2>Your keys and recovery</h2><p>You are responsible for keeping permanent keys and keeper phrases private. A sealed Baul without a confirmed recovery email may be permanently inaccessible if its key is lost. Recovery rotates access only after the required verification flow.</p></section>
      <section><h2>Your content</h2><p>You retain responsibility for content you add. By uploading content, you confirm that you have permission to store and share it with the keepers of that Baul and permit Baul’s service providers to process it only as needed to operate the service.</p></section>
      <section><h2>Availability and loss</h2><p>Reasonable safeguards and backups are used, but no online beta can guarantee that content will never be unavailable or lost. Keep independent copies of irreplaceable memories.</p></section>
      <section><h2>Changes or closure</h2><p>The operator may limit, suspend, or close the beta to address security, legal, cost, abuse, or reliability concerns. Where practical, keepers will receive notice and an opportunity to retrieve content.</p></section>
    </PolicyPage>
  );
}
