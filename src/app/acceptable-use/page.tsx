import type { Metadata } from "next";
import { PolicyPage } from "@/components/PolicyPage";

export const metadata: Metadata = { title: "Acceptable use · Baul", alternates: { canonical: "/acceptable-use" } };

export default function AcceptableUsePage() {
  return (
    <PolicyPage title="Acceptable use" summary="Baul is for memories shared with people who have agreed to keep them together.">
      <section><h2>Do not use Baul to</h2><ul><li>Upload content you do not have the right or consent to store.</li><li>Harass, threaten, exploit, impersonate, or expose another person.</li><li>Store malware, stolen credentials, unlawful material, or instructions intended to harm systems or people.</li><li>Probe, bypass, overload, scrape, or interfere with Baul or its providers.</li><li>Share invitation, recovery, or permanent-key material with unintended recipients.</li></ul></section>
      <section><h2>Uploaded music and images</h2><p>Links and files must be yours, licensed to you, or otherwise lawful for you to share privately. Baul does not grant a license to third-party media.</p></section>
      <section><h2>Enforcement and reporting</h2><p>Access or content may be restricted while a credible safety, rights, abuse, or legal report is investigated. Report concerns to <a href="mailto:pauljohn.antigo@gmail.com">pauljohn.antigo@gmail.com</a>.</p></section>
    </PolicyPage>
  );
}
