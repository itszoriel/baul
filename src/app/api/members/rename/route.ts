import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isSameOrigin, jsonError } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/authz";

const RenameBody = z.object({ displayName: z.string().trim().min(1, "Enter a name.").max(40), vaultId: z.uuid() });

const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, "Request origin was not accepted.");
  const parsed = RenameBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid name.");
  const access = await requireMember(parsed.data.vaultId);
  if (!access.ok) return access.response;
  const member = access.member;

  // Spec §2.4: initial set doesn't count; after that, once per 30 days,
  // enforced here (server-side), never frontend-only.
  const cooldown = (changedAt: string) => {
    const nextAllowed = new Date(new Date(changedAt).getTime() + COOLDOWN_MS);
    const date = nextAllowed.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
    return jsonError(429, `You can change your name again on ${date}.`, { nextAllowedAt: nextAllowed.toISOString() });
  };
  if (member.name_changed_at && new Date(member.name_changed_at).getTime() + COOLDOWN_MS > Date.now()) {
    return cooldown(member.name_changed_at);
  }

  if (parsed.data.displayName === member.display_name) {
    return NextResponse.json({ displayName: member.display_name, unchanged: true });
  }

  // The cooldown condition is part of the UPDATE itself, so two concurrent
  // renames cannot both pass the check above.
  const cutoff = new Date(Date.now() - COOLDOWN_MS).toISOString();
  const { data: updated, error } = await supabaseAdmin()
    .from("members")
    .update({ display_name: parsed.data.displayName, name_changed_at: new Date().toISOString() })
    .eq("id", member.id)
    .or(`name_changed_at.is.null,name_changed_at.lt.${cutoff}`)
    .select("id");

  if (error) {
    if (error.code === "23505") return jsonError(409, "That name is already taken in this baul.");
    return jsonError(500, "Could not change your name. Try again.");
  }
  if (!updated?.length) return cooldown(new Date().toISOString());
  return NextResponse.json({ displayName: parsed.data.displayName }, { headers: { "Cache-Control": "private, no-store" } });
}
