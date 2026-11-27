import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin, jsonError } from "@/lib/api";
import { tokenHash } from "@/lib/crypto";
import { recoveryConfirmSchema } from "@/lib/domain";
import { logOperationalEvent } from "@/lib/observability";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, "Request origin was not accepted.");
  const parsed = recoveryConfirmSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "This confirmation link is invalid or expired.");
  const digest = tokenHash(parsed.data.token);
  const limit = await rateLimit(req, {
    name: "recovery-email-confirm",
    ip: { max: 10, windowMs: 60 * 60_000 },
  }).catch(() => null);
  if (!limit?.ok) return jsonError(429, "Too many confirmation attempts. Try again later.", { retryAfterSec: limit?.retryAfterSec ?? 0 });
  const { data: vaultId, error } = await supabaseAdmin().rpc("confirm_vault_recovery_email", { p_token_hash: digest });
  if (error || !vaultId) return jsonError(400, "This confirmation link is invalid or expired.");
  logOperationalEvent("recovery_email_confirmed", { vault_id: vaultId });
  return NextResponse.json({ confirmed: true }, { headers: { "Cache-Control": "private, no-store" } });
}
