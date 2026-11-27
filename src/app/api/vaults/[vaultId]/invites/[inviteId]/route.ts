import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin, jsonError } from "@/lib/api";
import { uuidSchema } from "@/lib/domain";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/authz";

export async function DELETE(req: NextRequest, context: { params: Promise<{ vaultId: string; inviteId: string }> }) {
  if (!isSameOrigin(req)) return jsonError(403, "Request origin was not accepted.");
  const { vaultId, inviteId } = await context.params;
  if (!uuidSchema.safeParse(vaultId).success || !uuidSchema.safeParse(inviteId).success) return jsonError(400, "Invalid invitation.");
  const access = await requireMember(vaultId, { admin: true, forbidden: "Only an admin keeper can revoke an invitation." });
  if (!access.ok) return access.response;

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
