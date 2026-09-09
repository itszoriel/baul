import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireVaultSession } from "@/lib/supabase/server";

export async function GET(_request: Request, context: { params: Promise<{ vaultId: string }> }) {
  const { vaultId } = await context.params;
  const session = await requireVaultSession(vaultId);
  if (!session.ok) return jsonError(session.status, session.error);
  const admin = supabaseAdmin();
  const [{ count: inviteCount }, { count: memoryCount }, { data: vault }] = await Promise.all([
    admin.from("vault_invites").select("id", { count: "exact", head: true }).eq("vault_id", vaultId),
    admin.from("memories").select("id", { count: "exact", head: true }).eq("vault_id", vaultId),
    admin.from("vaults").select("recovery_email_hash, recovery_email_confirmed_at").eq("id", vaultId).maybeSingle(),
  ]);
  return NextResponse.json({
    invitationCreated: (inviteCount ?? 0) > 0,
    firstMemoryAdded: (memoryCount ?? 0) > 0,
    recoveryConfigured: Boolean(vault?.recovery_email_hash),
    recoveryEmailConfirmed: Boolean(vault?.recovery_email_confirmed_at),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
