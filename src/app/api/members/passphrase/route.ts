import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isSameOrigin, jsonError } from "@/lib/api";
import { keeperPhraseSchema, legacyKeeperPhraseSchema } from "@/lib/domain";
import { hashPassphrase, normalizePassphrase, verifyPassphrase } from "@/lib/keys";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/authz";

const Body = z.object({
  vaultId: z.uuid(),
  currentPassphrase: legacyKeeperPhraseSchema,
  newPassphrase: keeperPhraseSchema,
});

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, "Request origin was not accepted.");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid keeper phrase.");
  const access = await requireMember(parsed.data.vaultId);
  if (!access.ok) return access.response;
  const member = access.member;

  const limit = await rateLimit(req, {
    name: "change-passphrase",
    identifier: { value: member.id, max: 5, windowMs: 15 * 60_000 },
  }).catch(() => null);
  if (!limit?.ok) return jsonError(429, "Too many attempts. Try again later.", { retryAfterSec: limit?.retryAfterSec ?? 0 });
  const admin = supabaseAdmin();
  const { data: secret } = await admin.from("member_secrets").select("secret_hash").eq("member_id", member.id).maybeSingle();
  if (!secret || !(await verifyPassphrase(normalizePassphrase(parsed.data.currentPassphrase), secret.secret_hash))) {
    return jsonError(403, "The current keeper phrase did not match.");
  }
  const { error } = await admin.from("member_secrets").update({
    secret_hash: await hashPassphrase(normalizePassphrase(parsed.data.newPassphrase)),
    set_at: new Date().toISOString(),
  }).eq("member_id", member.id);
  if (error) return jsonError(500, "Could not update the keeper phrase.");
  return NextResponse.json({ updated: true }, { headers: { "Cache-Control": "private, no-store" } });
}
