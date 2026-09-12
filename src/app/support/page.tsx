import type { Metadata } from "next";
import { PolicyPage } from "@/components/PolicyPage";

export const metadata: Metadata = { title: "Support · Baul", alternates: { canonical: "/support" } };

export default function SupportPage() {
  return (
    <PolicyPage title="Support" summary="Baul is designed and programmed by Paul John E. Antigo (itszoriel).">
      <section><h2>Contact</h2><p>Email <a href="mailto:pauljohn.antigo@gmail.com">pauljohn.antigo@gmail.com</a> for beta support, privacy requests, content concerns, or security reports. Do not include a permanent key, keeper phrase, invitation token, recovery token, or private memory in the message.</p></section>
      <section><h2>Useful details</h2><p>Include what you were trying to do, the approximate time, browser and device, and any request ID displayed by Baul. Request IDs help diagnose server failures without sending private content.</p></section>
      <section><h2>Emergency expectations</h2><p>This personal beta does not provide emergency or around-the-clock support. If a report concerns immediate danger, contact the appropriate local emergency service.</p></section>
    </PolicyPage>
  );
}
