import type { Metadata } from "next";
import { PolicyPage } from "@/components/PolicyPage";

export const metadata: Metadata = { title: "Privacy · Baul", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return (
    <PolicyPage title="Privacy notice" summary="What the Baul beta stores, why it stores it, and the controls available to keepers.">
      <section><h2>Information Baul keeps</h2><p>Baul stores vault names and settings, anonymous authentication identifiers, keeper display names, encrypted recovery email addresses when supplied, notes, letters, messages, reactions, uploaded photos, avatars, stickers, songs, and coarse location choices used for delayed aggregate statistics.</p></section>
      <section><h2>How it is used</h2><p>The information is used only to operate the shared vault, authorize active keepers, deliver requested recovery messages, maintain private media, prevent abuse, and show privacy-thresholded aggregate globe counts.</p></section>
      <section><h2>Security and access</h2><p>Private content is protected through server-side authorization, database row-level security, and private object storage. Baul is not end-to-end encrypted. The operator and infrastructure providers can technically access server-side content when necessary to operate, secure, back up, or recover the service.</p></section>
      <section><h2>Service providers</h2><p>The beta uses Vercel for the web application, Supabase for database, authentication, realtime, and private storage, Resend for transactional email, Cloudflare for bot protection and encrypted backup storage, GitHub for source and automated jobs, and Sentry for privacy-filtered error monitoring.</p></section>
      <section><h2>Retention and deletion</h2><p>Content remains until an authorized keeper deletes it or the beta is discontinued. Deleted media enters a retryable cleanup queue. Encrypted backups may retain deleted content for up to the documented backup-retention window before pruning.</p></section>
      <section><h2>Your choices</h2><p>Location and recovery email are optional. Keepers can ask for access, correction, or deletion help by contacting <a href="mailto:pauljohn.antigo@gmail.com">pauljohn.antigo@gmail.com</a>. Requests are verified before changes are made.</p></section>
    </PolicyPage>
  );
}
