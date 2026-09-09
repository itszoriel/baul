import "server-only";

import { Resend } from "resend";
import KeyEmail from "@/emails/KeyEmail";

function resendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

function fromAddress(): string {
  return process.env.EMAIL_FROM ?? "Baul <onboarding@resend.dev>";
}

function replyToAddress(): string | undefined {
  return process.env.EMAIL_REPLY_TO?.trim() || undefined;
}

function recipientAllowed(recipient: string): boolean {
  const configured = process.env.EMAIL_RECIPIENT_ALLOWLIST;
  if (!configured) return process.env.NODE_ENV !== "production";
  const allowed = new Set(configured.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
  return allowed.has(recipient.trim().toLowerCase());
}

/** Send a short-lived action link. Permanent keys never enter email. */
export async function sendActionEmail(opts: {
  to: string;
  vaultName: string;
  actionUrl: string;
  kind: "invite" | "recovery" | "recovery-verify";
}): Promise<boolean> {
  if (!recipientAllowed(opts.to)) return false;
  const resend = resendClient();
  if (!resend) return false;

  const { error } = await resend.emails.send({
    from: fromAddress(),
    replyTo: replyToAddress(),
    to: opts.to,
    subject:
      opts.kind === "invite"
        ? `You have been invited to ${opts.vaultName}`
        : opts.kind === "recovery-verify"
          ? `Confirm the recovery email for ${opts.vaultName}`
          : `Confirm key recovery for ${opts.vaultName}`,
    react: KeyEmail({
      vaultName: opts.vaultName,
      actionUrl: opts.actionUrl,
      kind: opts.kind,
    }),
  });
  return !error;
}
