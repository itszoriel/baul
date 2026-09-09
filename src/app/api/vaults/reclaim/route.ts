import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin, jsonError } from "@/lib/api";
import { verifyJoinTicket } from "@/lib/crypto";
import { LIMITS, reclaimSchema } from "@/lib/domain";
import { normalizePassphrase, verifyPassphrase } from "@/lib/keys";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

const MISMATCH = "That name and keeper phrase don't match a keeper here.";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, "Request origin was not accepted.");
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "Not signed in.");

  const parsed = reclaimSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Enter your keeper name and phrase.");
  const ticket = verifyJoinTicket(parsed.data.joinToken);
  if (!ticket) return jsonError(403, "This entry pass has expired—enter your key again.");

  const limit = await rateLimit(req, {
    name: "reclaim-member",
    max: 5,
    windowMs: 60_000,
    identifier: `${ticket.vaultId}:${parsed.data.username}`,
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

  const { data: members } = await admin
    .from("members")
    .select("id, display_name")
    .eq("vault_id", vault.id)
    .is("revoked_at", null);
  const wanted = parsed.data.username.toLocaleLowerCase();
  const member = (members ?? []).find((candidate) => candidate.display_name.toLocaleLowerCase() === wanted);
  if (!member) return jsonError(403, MISMATCH);

  const { data: secret } = await admin
    .from("member_secrets")
    .select("secret_hash")
    .eq("member_id", member.id)
    .maybeSingle();
  const passphrase = normalizePassphrase(parsed.data.passphrase);
  if (!secret || !(await verifyPassphrase(passphrase, secret.secret_hash))) return jsonError(403, MISMATCH);

  const { data, error } = await admin.rpc("rebind_vault_member", {
    p_member_id: member.id,
    p_user_id: user.id,
  });
  const rebound = data?.[0];
  if (error || !rebound) {
    if (error?.code === "23505") return jsonError(409, "This device already holds another keeper in this baul.");
    return jsonError(500, "Could not reclaim your keeper. Try again.");
  }

  return NextResponse.json({
    memberId: rebound.member_id,
    vault: { id: rebound.vault_id, name: rebound.vault_name, vaultType: rebound.vault_type },
    needsPhraseUpgrade: passphrase.length < LIMITS.keeperPhraseMin,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
