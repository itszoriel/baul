import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { uuidSchema } from "@/lib/domain";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/authz";
import type { SecurityEvent } from "@/lib/types";

/**
 * Admin-only view of recent membership security events, so a reclaim on a
 * new device or a key rotation is visible instead of silent. Auth user ids
 * are never returned.
 */
export async function GET(_request: Request, context: { params: Promise<{ vaultId: string }> }) {
  const { vaultId } = await context.params;
  if (!uuidSchema.safeParse(vaultId).success) return jsonError(400, "Invalid Baul.");
  const access = await requireMember(vaultId, { admin: true, forbidden: "Only an admin keeper can view security activity." });
  if (!access.ok) return access.response;

  const { data, error } = await supabaseAdmin()
    .from("membership_events")
    .select("event_type, subject_member_id, actor_member_id, created_at")
    .eq("vault_id", vaultId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return jsonError(500, "Could not load security activity.");

  const events: SecurityEvent[] = (data ?? []).map((row) => ({
    type: row.event_type as SecurityEvent["type"],
    subjectMemberId: row.subject_member_id,
    actorMemberId: row.actor_member_id,
    at: row.created_at,
  }));
  return NextResponse.json({ events }, { headers: { "Cache-Control": "private, no-store" } });
}
