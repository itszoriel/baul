import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isSameOrigin, jsonError, loadMember } from "@/lib/api";
import { generateVaultKey, hashKey, keyLookupHash } from "@/lib/keys";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireVaultSession } from "@/lib/supabase/server";

/**
 * Admin lever (spec §5.7): rotate the vault key. The old key stops working
 * immediately; existing live memberships remain active.
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, "Request origin was not accepted.");
  const parsed = z.object({ vaultId: z.uuid() }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(400, "Invalid Baul.");
  const session = await requireVaultSession(parsed.data.vaultId);
  if (!session.ok) return jsonError(session.status, session.error);

  const member = await loadMember(session.claims.vaultId, session.claims.memberId);
  if (!member || member.role !== "admin") return jsonError(403, "Only the baul's keeper can forge a new key.");

  const admin = supabaseAdmin();
  const key = generateVaultKey();
  const { error } = await admin
    .from("vaults")
    .update({ key_hash: await hashKey(key), key_lookup: keyLookupHash(key) })
    .eq("id", session.claims.vaultId);
  if (error) return jsonError(500, "Could not forge a new key. Try again.");

  await admin.from("membership_events").insert({
    vault_id: session.claims.vaultId,
    subject_member_id: member.id,
    actor_member_id: member.id,
    event_type: "key_rotated",
  });
  return NextResponse.json({ key }, { headers: { "Cache-Control": "private, no-store" } });
}
