import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin, jsonError, loadMember } from "@/lib/api";
import { uuidSchema } from "@/lib/domain";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireVaultSession } from "@/lib/supabase/server";

export async function DELETE(req: NextRequest, context: { params: Promise<{ vaultId: string; inviteId: string }> }) {
  if (!isSameOrigin(req)) return jsonError(403, "Request origin was not accepted.");
  const { vaultId, inviteId } = await context.params;
  if (!uuidSchema.safeParse(vaultId).success || !uuidSchema.safeParse(inviteId).success) return jsonError(400, "Invalid invitation.");
  const session = await requireVaultSession(vaultId);
  if (!session.ok) return jsonError(session.status, session.error);
  const member = await loadMember(vaultId, session.claims.memberId);
  if (!member || member.role !== "admin") return jsonError(403, "Only an admin keeper can revoke an invitation.");

  const { data, error } = await supabaseAdmin()
    .from("vault_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId)
    .eq("vault_id", vaultId)
    .is("redeemed_at", null)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error) return jsonError(500, "Could not revoke this invitation.");
  if (!data) return jsonError(404, "This invitation is no longer active.");
  return new NextResponse(null, { status: 204 });
}
