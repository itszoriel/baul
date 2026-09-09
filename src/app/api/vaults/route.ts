import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin, jsonError } from "@/lib/api";
import { emailBlindIndex, encryptEmail, generateOpaqueToken, signJoinTicket, tokenHash } from "@/lib/crypto";
import { createVaultSchema } from "@/lib/domain";
import { resolveVaultLocation } from "@/lib/divisions";
import { generateVaultKey, hashKey, keyLookupHash } from "@/lib/keys";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendActionEmail } from "@/lib/email";
import { appUrl } from "@/lib/env";
import { logOperationalEvent } from "@/lib/observability";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, "Request origin was not accepted.");
  const parsed = createVaultSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid request.");
  const body = parsed.data;

  const limit = await rateLimit(req, {
    name: "create-vault",
    max: 10,
    windowMs: 60 * 60 * 1_000,
    identifier: body.recoveryEmail ?? undefined,
    turnstileToken: body.turnstileToken,
  }).catch(() => null);
  if (!limit) return jsonError(503, "Baul is temporarily unavailable. Try again.");
  if (!limit.ok) {
    return jsonError(429, limit.challengeRequired ? "Please complete the security check." : "Too many attempts.", {
      retryAfterSec: limit.retryAfterSec,
      challengeRequired: limit.challengeRequired,
    });
  }

  const vaultType = body.maxMembers === 2 && body.purpose === "romance" ? "intimate" : "circle";
  const resolved = await resolveVaultLocation(body.countryId ?? null, body.divisionId ?? null);
  if (!resolved.ok) return jsonError(400, resolved.error);

  const key = generateVaultKey();
  const { data: vault, error } = await supabaseAdmin()
    .from("vaults")
    .insert({
      name: body.name,
      key_hash: await hashKey(key),
      key_lookup: keyLookupHash(key),
      vault_type: vaultType,
      purpose: body.purpose,
      max_members: body.maxMembers,
      recovery_email_enc: body.recoveryEmail ? encryptEmail(body.recoveryEmail) : null,
      recovery_email_hash: body.recoveryEmail ? emailBlindIndex(body.recoveryEmail) : null,
      country_id: resolved.location.countryId,
      division_id: resolved.location.divisionId,
      milestone_date: body.milestoneDate ?? null,
    })
    .select("id, name, vault_type")
    .single();

  if (error || !vault) return jsonError(500, "Could not create your baul. Try again.");

  let recoveryConfirmationSent = false;
  if (body.recoveryEmail) {
    const confirmationToken = generateOpaqueToken();
    const { data: confirmation } = await supabaseAdmin().from("vault_email_confirmations").insert({
      vault_id: vault.id,
      token_hash: tokenHash(confirmationToken),
      expires_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
    }).select("id").single();
    if (confirmation) {
      recoveryConfirmationSent = await sendActionEmail({
        to: body.recoveryEmail,
        vaultName: vault.name,
        actionUrl: `${appUrl()}/recover/verify?token=${encodeURIComponent(confirmationToken)}`,
        kind: "recovery-verify",
      }).catch(() => false);
      if (!recoveryConfirmationSent) {
        await supabaseAdmin().from("vault_email_confirmations").delete().eq("id", confirmation.id);
        logOperationalEvent("email_delivery_failed", { operation: "recovery_verification" });
      }
    }
  }

  return NextResponse.json(
    {
      key,
      vaultId: vault.id,
      joinToken: signJoinTicket(vault.id),
      vaultName: vault.name,
      vaultType: vault.vault_type,
      recoveryConfigured: Boolean(body.recoveryEmail),
      recoveryConfirmationSent,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
