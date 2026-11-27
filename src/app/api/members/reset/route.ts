import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isSameOrigin, jsonError } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/authz";
import type { Database } from "@/lib/database.types";

const Body = z.object({
  memberId: z.uuid(),
  vaultId: z.uuid(),
  resetName: z.boolean().default(false),
  resetAvatar: z.boolean().default(false),
});

/** Admin lever (spec §2.4): reset an inappropriate name and/or photo. */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, "Request origin was not accepted.");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.resetName && !parsed.data.resetAvatar)) {
    return jsonError(400, "Invalid request.");
  }
  const access = await requireMember(parsed.data.vaultId, { admin: true, forbidden: "Only an admin keeper can reset members." });
  if (!access.ok) return access.response;
  const caller = access.member;

  const admin = supabaseAdmin();
  const { data: target } = await admin
    .from("members")
    .select("id")
    .eq("id", parsed.data.memberId)
    .eq("vault_id", caller.vault_id)
    .maybeSingle();
  if (!target) return jsonError(404, "That member isn't in this baul.");

  const updates: Database["public"]["Tables"]["members"]["Update"] = {};
  if (parsed.data.resetName) {
    // 32 random bits: a collision with the per-vault unique name is negligible.
    updates.display_name = `Member-${randomBytes(4).toString("hex")}`;
    updates.name_changed_at = new Date().toISOString();
  }
  if (parsed.data.resetAvatar) {
    updates.avatar_url = null;
    await admin.from("storage_cleanup_queue").insert({
      bucket: "avatars",
      object_key: `${caller.vault_id}/${target.id}.webp`,
    });
  }

  const { error } = await admin.from("members").update(updates).eq("id", target.id);
  if (error) return jsonError(500, "Could not reset that member. Try again.");
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
