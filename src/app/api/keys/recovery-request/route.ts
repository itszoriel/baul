import { after, NextRequest, NextResponse } from "next/server";
import { isSameOrigin, jsonError } from "@/lib/api";
import {
  emailBlindIndex,
  emailBlindIndexCandidates,
  encryptEmail,
  generateOpaqueToken,
  tokenHash,
} from "@/lib/crypto";
import { recoveryRequestSchema, type RecoveryRequestResult } from "@/lib/domain";
import { sendActionEmail } from "@/lib/email";
import { appUrl } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logOperationalEvent } from "@/lib/observability";

const GENERIC: RecoveryRequestResult = {
  message: "If that email guards a baul, a confirmation link is on its way.",
};

function genericResponse() {
  return NextResponse.json(GENERIC, {
    status: 202,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/**
 * Look up vaults guarded by this (confirmed) address and email each one a
 * single-use confirmation link. Runs after the response so its timing cannot
 * reveal whether the address guards any baul.
 */
async function sendRecoveryLinks(email: string): Promise<void> {
  const admin = supabaseAdmin();
  const currentIndex = emailBlindIndex(email);
  const { data: vaults, error } = await admin
    .from("vaults")
    .select("id, name, recovery_email_hash")
    .in("recovery_email_hash", emailBlindIndexCandidates(email))
    // Only a confirmed address may receive a key-rotation link.
    .not("recovery_email_confirmed_at", "is", null);
  if (error) {
    logOperationalEvent("database_operation_failed", { operation: "recovery_lookup", error_code: error.code });
    return;
  }

  for (const vault of vaults ?? []) {
    // Lazily move vaults written under a previous or legacy secret onto the
    // current one; the plaintext address is in hand only at this moment.
    if (vault.recovery_email_hash !== currentIndex) {
      await admin
        .from("vaults")
        .update({ recovery_email_hash: currentIndex, recovery_email_enc: encryptEmail(email) })
        .eq("id", vault.id);
    }

    const token = generateOpaqueToken();
    const { data: request } = await admin
      .from("vault_recovery_requests")
      .insert({
        vault_id: vault.id,
        token_hash: tokenHash(token),
        expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      })
      .select("id")
      .single();
    if (!request) continue;

    const delivered = await sendActionEmail({
      to: email,
      vaultName: vault.name,
      actionUrl: `${appUrl()}/recover/confirm?token=${encodeURIComponent(token)}`,
      kind: "recovery",
    }).catch(() => false);
    if (!delivered) {
      await admin.from("vault_recovery_requests").delete().eq("id", request.id);
      logOperationalEvent("email_delivery_failed", { operation: "recovery" });
    }
  }
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, "Request origin was not accepted.");
  const parsed = recoveryRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return genericResponse();

  const limit = await rateLimit(req, {
    name: "recovery-request",
    ip: { max: 10, windowMs: 15 * 60_000 },
    // At most three recovery emails per address per hour, from any IP.
    identifier: { value: parsed.data.email, max: 3, windowMs: 60 * 60_000 },
    challenge: true,
    turnstileToken: parsed.data.turnstileToken,
  }).catch(() => null);
  if (!limit?.ok) return genericResponse();

  const email = parsed.data.email;
  after(() => sendRecoveryLinks(email).catch(() => {
    logOperationalEvent("recovery_request_failed");
  }));
  return genericResponse();
}
