import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin, jsonError } from "@/lib/api";
import { signJoinTicket } from "@/lib/crypto";
import { verifyKeySchema } from "@/lib/domain";
import { keyLookupHash, normalizeKey, verifyKey } from "@/lib/keys";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

const WRONG_KEY = "That key doesn't open anything. Check it and try again.";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, "Request origin was not accepted.");
  const parsed = verifyKeySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Enter a key.");
  const key = normalizeKey(parsed.data.key);

  const limit = await rateLimit(req, {
    name: "verify-key",
    max: 5,
    windowMs: 60_000,
    identifier: keyLookupHash(key),
    turnstileToken: parsed.data.turnstileToken,
  }).catch(() => null);
  if (!limit) return jsonError(503, "Baul is temporarily unavailable. Try again.");
  if (!limit.ok) {
    return jsonError(429, limit.challengeRequired ? "Please complete the security check." : "Too many attempts.", {
      retryAfterSec: limit.retryAfterSec,
      challengeRequired: limit.challengeRequired,
    });
  }

  const admin = supabaseAdmin();
  const { data: vault } = await admin
    .from("vaults")
    .select("id, name, vault_type, max_members, key_hash")
    .eq("key_lookup", keyLookupHash(key))
    .maybeSingle();
  if (!vault || !(await verifyKey(key, vault.key_hash))) return jsonError(404, WRONG_KEY);

  const { count } = await admin
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("vault_id", vault.id)
    .is("revoked_at", null);

  let alreadyMember = false;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: member } = await admin
      .from("members")
      .select("id")
      .eq("vault_id", vault.id)
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .maybeSingle();
    alreadyMember = Boolean(member);
  }

  const memberCount = count ?? 0;
  return NextResponse.json({
    joinToken: signJoinTicket(vault.id),
    vault: {
      name: vault.name,
      vaultType: vault.vault_type,
      memberCount,
      maxMembers: vault.max_members,
      isFull: !alreadyMember && memberCount >= vault.max_members,
      alreadyMember,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
