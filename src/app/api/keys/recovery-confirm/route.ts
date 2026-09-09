import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin, jsonError } from "@/lib/api";
import { recoveryConfirmSchema, type RecoveryConfirmResult } from "@/lib/domain";
import { tokenHash } from "@/lib/crypto";
import { generateVaultKey, hashKey, keyLookupHash } from "@/lib/keys";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logOperationalEvent } from "@/lib/observability";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, "Request origin was not accepted.");
  const parsed = recoveryConfirmSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "This recovery link is invalid or expired.");

  const digest = tokenHash(parsed.data.token);
  const limit = await rateLimit(req, {
    name: "recovery-confirm",
    max: 5,
    windowMs: 30 * 60_000,
    identifier: digest,
    turnstileToken: parsed.data.turnstileToken,
  }).catch(() => null);
  if (!limit?.ok) return jsonError(429, "Please complete the security check.", {
    retryAfterSec: limit?.retryAfterSec ?? 0,
    challengeRequired: true,
  });

  const key = generateVaultKey();
  const { data, error } = await supabaseAdmin().rpc("confirm_vault_recovery", {
    p_token_hash: digest,
    p_key_hash: await hashKey(key),
    p_key_lookup: keyLookupHash(key),
  });
  const vault = data?.[0];
  if (error || !vault) return jsonError(400, "This recovery link is invalid or expired.");

  const result: RecoveryConfirmResult = {
    key,
    vault: { id: vault.vault_id, name: vault.vault_name },
  };
  logOperationalEvent("recovery_confirmed", { vault_id: vault.vault_id });
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
