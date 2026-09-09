import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin, jsonError } from "@/lib/api";
import { pickAvatarColor } from "@/lib/avatar-colors";
import { verifyJoinTicket } from "@/lib/crypto";
import { manualJoinSchema } from "@/lib/domain";
import { hashPassphrase, normalizePassphrase } from "@/lib/keys";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, "Request origin was not accepted.");
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "Not signed in.");

  const parsed = manualJoinSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid request.");
  const ticket = verifyJoinTicket(parsed.data.joinToken);
  if (!ticket) return jsonError(403, "This entry pass has expired—enter your key again.");

  const limit = await rateLimit(req, {
    name: "join-vault",
    max: 10,
    windowMs: 60_000,
    identifier: ticket.vaultId,
    turnstileToken: parsed.data.turnstileToken,
  }).catch(() => null);
  if (!limit) return jsonError(503, "Baul is temporarily unavailable. Try again.");
  if (!limit.ok) return jsonError(429, "Please complete the security check.", {
    retryAfterSec: limit.retryAfterSec,
    challengeRequired: limit.challengeRequired,
  });

  const admin = supabaseAdmin();
  const { data: vault } = await admin
    .from("vaults")
    .select("id, name, vault_type")
    .eq("id", ticket.vaultId)
    .maybeSingle();
  if (!vault) return jsonError(404, "This baul no longer exists.");

  const { data: existing } = await admin
    .from("members")
    .select("id")
    .eq("vault_id", vault.id)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({
      memberId: existing.id,
      vault: { id: vault.id, name: vault.name, vaultType: vault.vault_type },
    });
  }

  if (!parsed.data.displayName || !parsed.data.passphrase) {
    return jsonError(400, "Choose a keeper name and personal keeper phrase.", { needsIdentity: true });
  }

  const { data: current } = await admin
    .from("members")
    .select("avatar_color")
    .eq("vault_id", vault.id)
    .is("revoked_at", null);
  const passphrase = normalizePassphrase(parsed.data.passphrase);
  const { data, error } = await admin.rpc("join_vault_member", {
    p_vault_id: vault.id,
    p_user_id: user.id,
    p_display_name: parsed.data.displayName,
    p_avatar_color: pickAvatarColor((current ?? []).map((member) => member.avatar_color)),
    p_secret_hash: await hashPassphrase(passphrase),
  });
  const joined = data?.[0];
  if (error || !joined) {
    if (error?.message.includes("vault_full")) return jsonError(409, "This baul is already full.");
    if (error?.message.includes("membership_revoked")) return jsonError(403, "This keeper was removed from the baul.");
    if (error?.code === "23505") return jsonError(409, "That keeper name is already taken.");
    return jsonError(500, "Could not join this baul. Try again.");
  }

  return NextResponse.json({
    memberId: joined.member_id,
    vault: { id: joined.vault_id, name: joined.vault_name, vaultType: joined.vault_type },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
