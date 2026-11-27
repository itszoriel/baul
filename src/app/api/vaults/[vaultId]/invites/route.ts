import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin, jsonError } from "@/lib/api";
import { generateOpaqueToken, tokenHash } from "@/lib/crypto";
import { createInviteSchema, type InviteResult } from "@/lib/domain";
import { appUrl } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/authz";

export async function POST(req: NextRequest, context: { params: Promise<{ vaultId: string }> }) {
  if (!isSameOrigin(req)) return jsonError(403, "Request origin was not accepted.");
  const { vaultId } = await context.params;
  const access = await requireMember(vaultId, { admin: true, forbidden: "Only an admin keeper can invite someone." });
  if (!access.ok) return access.response;
  const member = access.member;

  const parsed = createInviteSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(400, "Choose a valid invitation expiry.");
  const limit = await rateLimit(req, {
    name: "create-invite",
    identifier: { value: vaultId, max: 20, windowMs: 60 * 60_000 },
  }).catch(() => null);
  if (!limit?.ok) return jsonError(429, "Too many invitations were created. Try again later.", {
    retryAfterSec: limit?.retryAfterSec ?? 0,
  });

  const token = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60_000).toISOString();
  const { data: invite, error } = await supabaseAdmin()
    .from("vault_invites")
    .insert({ vault_id: vaultId, created_by: member.id, token_hash: tokenHash(token), expires_at: expiresAt })
    .select("id")
    .single();
  if (error || !invite) return jsonError(500, "Could not create an invitation.");

  const result: InviteResult = {
    inviteId: invite.id,
    inviteUrl: `${appUrl()}/invite/${encodeURIComponent(token)}`,
    expiresAt,
  };
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
