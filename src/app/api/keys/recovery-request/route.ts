import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin, jsonError } from "@/lib/api";
import { emailBlindIndex, generateOpaqueToken, tokenHash } from "@/lib/crypto";
import { recoveryRequestSchema, type RecoveryRequestResult } from "@/lib/domain";
import { sendActionEmail } from "@/lib/email";
import { appUrl } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logOperationalEvent } from "@/lib/observability";

const GENERIC: RecoveryRequestResult = {
  message: "If that email guards a baul, a confirmation link is on its way.",
};

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, "Request origin was not accepted.");
  const parsed = recoveryRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(GENERIC, { status: 202 });

  const limit = await rateLimit(req, {
    name: "recovery-request",
    max: 3,
    windowMs: 15 * 60_000,
    identifier: parsed.data.email,
    turnstileToken: parsed.data.turnstileToken,
  }).catch(() => null);
  if (!limit?.ok) return NextResponse.json(GENERIC, { status: 202 });

  const admin = supabaseAdmin();
  const { data: vaults } = await admin
    .from("vaults")
    .select("id, name")
    .eq("recovery_email_hash", emailBlindIndex(parsed.data.email));

  for (const vault of vaults ?? []) {
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
      to: parsed.data.email,
      vaultName: vault.name,
      actionUrl: `${appUrl()}/recover/confirm?token=${encodeURIComponent(token)}`,
      kind: "recovery",
    }).catch(() => false);
    if (!delivered) {
      await admin.from("vault_recovery_requests").delete().eq("id", request.id);
      logOperationalEvent("email_delivery_failed", { operation: "recovery" });
    }
  }

  return NextResponse.json(GENERIC, {
    status: 202,
    headers: { "Cache-Control": "private, no-store" },
  });
}
