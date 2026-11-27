import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin, jsonError } from "@/lib/api";
import { memoryEntrySchema } from "@/lib/domain";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/authz";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, "Request origin was not accepted.");
  const parsed = memoryEntrySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid memory.");
  const access = await requireMember(parsed.data.vaultId);
  if (!access.ok) return access.response;
  const member = access.member;

  const unlockAt = parsed.data.unlockAt ? new Date(parsed.data.unlockAt) : null;
  if (unlockAt && unlockAt.getTime() <= Date.now() + 60 * 60_000) {
    return jsonError(400, "A sealed letter must stay closed for at least one hour.");
  }

  const { data, error } = await supabaseAdmin().rpc("create_memory_entry", {
    p_vault_id: parsed.data.vaultId,
    p_member_id: member.id,
    p_kind: parsed.data.kind,
    p_content: parsed.data.content.trim(),
    p_unlock_at: unlockAt?.toISOString(),
    p_song_id: parsed.data.songId ?? undefined,
  });
  if (error || !data) return jsonError(500, "Could not keep this memory. Try again.");
  return NextResponse.json({ memory: data }, { headers: { "Cache-Control": "private, no-store" } });
}
