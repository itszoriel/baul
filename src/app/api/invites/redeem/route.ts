import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin, jsonError } from "@/lib/api";
import { pickAvatarColor } from "@/lib/avatar-colors";
import { tokenHash } from "@/lib/crypto";
import { redeemInviteSchema, type InviteRedeemResult } from "@/lib/domain";
import { hashPassphrase, normalizePassphrase } from "@/lib/keys";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { logOperationalEvent } from "@/lib/observability";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, "Request origin was not accepted.");
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "Not signed in.");

  const parsed = redeemInviteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid invitation details.");
  const digest = tokenHash(parsed.data.token);
  const limit = await rateLimit(req, {
    name: "redeem-invite",
    max: 5,
    windowMs: 15 * 60_000,
    identifier: digest,
    turnstileToken: parsed.data.turnstileToken,
  }).catch(() => null);
  if (!limit?.ok) return jsonError(429, "Please complete the security check.", {
    retryAfterSec: limit?.retryAfterSec ?? 0,
    challengeRequired: true,
  });

  const admin = supabaseAdmin();
  const { data: invite } = await admin
    .from("vault_invites")
    .select("vault_id")
    .eq("token_hash", digest)
    .is("revoked_at", null)
    .is("redeemed_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!invite) return jsonError(400, "This invitation is invalid or expired.");

  const { data: current } = await admin
    .from("members")
    .select("avatar_color")
    .eq("vault_id", invite.vault_id)
    .is("revoked_at", null);
  const { data, error } = await admin.rpc("redeem_vault_invite", {
    p_token_hash: digest,
    p_user_id: user.id,
    p_display_name: parsed.data.displayName,
    p_avatar_color: pickAvatarColor((current ?? []).map((member) => member.avatar_color)),
    p_secret_hash: await hashPassphrase(normalizePassphrase(parsed.data.passphrase)),
  });
  const redeemed = data?.[0];
  if (error || !redeemed) {
    if (error?.message.includes("vault_full")) return jsonError(409, "This baul is already full.");
    if (error?.code === "23505") return jsonError(409, "That keeper name is already taken.");
    return jsonError(400, "This invitation is invalid or expired.");
  }

  const result: InviteRedeemResult = {
    memberId: redeemed.member_id,
    vault: { id: redeemed.vault_id, name: redeemed.vault_name, vaultType: redeemed.vault_type as "intimate" | "circle" },
  };
  logOperationalEvent("invite_redeemed", { vault_id: redeemed.vault_id });
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
