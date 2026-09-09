import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isSameOrigin, jsonError, loadMember } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireVaultSession } from "@/lib/supabase/server";

const RenameBody = z.object({ displayName: z.string().trim().min(1, "Enter a name.").max(40), vaultId: z.uuid() });

const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, "Request origin was not accepted.");
  const parsed = RenameBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid name.");
  const session = await requireVaultSession(parsed.data.vaultId);
  if (!session.ok) return jsonError(session.status, session.error);

  const member = await loadMember(session.claims.vaultId, session.claims.memberId);
  if (!member) return jsonError(403, "No baul session — enter your key first.");

  // Spec §2.4: initial set doesn't count; after that, once per 30 days,
  // enforced here (server-side), never frontend-only.
  if (member.name_changed_at) {
    const nextAllowed = new Date(new Date(member.name_changed_at).getTime() + COOLDOWN_MS);
    if (nextAllowed.getTime() > Date.now()) {
      const date = nextAllowed.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      return jsonError(429, `You can change your name again on ${date}.`, {
        nextAllowedAt: nextAllowed.toISOString(),
      });
    }
  }

  if (parsed.data.displayName === member.display_name) {
    return NextResponse.json({ displayName: member.display_name, unchanged: true });
  }

  const { error } = await supabaseAdmin()
    .from("members")
    .update({ display_name: parsed.data.displayName, name_changed_at: new Date().toISOString() })
    .eq("id", member.id);

  if (error) {
    if (error.code === "23505") return jsonError(409, "That name is already taken in this baul.");
    return jsonError(500, "Could not change your name. Try again.");
  }
  return NextResponse.json({ displayName: parsed.data.displayName }, { headers: { "Cache-Control": "private, no-store" } });
}
