import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isSameOrigin, jsonError, loadMember } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireVaultSession } from "@/lib/supabase/server";

const Body = z.object({ memberId: z.uuid(), vaultId: z.uuid() });

/** Revoke access while preserving every attributed memory and message. */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, "Request origin was not accepted.");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Invalid request.");
  const session = await requireVaultSession(parsed.data.vaultId);
  if (!session.ok) return jsonError(session.status, session.error);

  const caller = await loadMember(session.claims.vaultId, session.claims.memberId);
  if (!caller || caller.role !== "admin") return jsonError(403, "Only an admin keeper can remove members.");

  const { error } = await supabaseAdmin().rpc("revoke_vault_member", {
    p_vault_id: session.claims.vaultId,
    p_actor_member_id: caller.id,
    p_subject_member_id: parsed.data.memberId,
  });
  if (error) {
    if (error.message.includes("cannot_revoke_self")) return jsonError(400, "You cannot remove yourself.");
    if (error.message.includes("last_admin")) return jsonError(409, "The last admin keeper cannot be removed.");
    if (error.message.includes("membership_unavailable")) return jsonError(404, "That keeper is not active here.");
    return jsonError(500, "Could not remove that keeper. Try again.");
  }
  return NextResponse.json({ revoked: parsed.data.memberId });
}
