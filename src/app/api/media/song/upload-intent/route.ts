import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin, jsonError, loadMember } from "@/lib/api";
import { songUploadIntentSchema, type SongUploadIntentResult } from "@/lib/domain";
import { logOperationalEvent } from "@/lib/observability";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireVaultSession } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, "Request origin was not accepted.");
  const parsed = songUploadIntentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "Choose a valid MP3.");
  }

  const session = await requireVaultSession(parsed.data.vaultId);
  if (!session.ok) return jsonError(session.status, session.error);
  const member = await loadMember(parsed.data.vaultId, session.claims.memberId);
  if (!member) return jsonError(403, "No active keeper access to this baul.");

  const limit = await rateLimit(req, {
    name: "song-upload",
    max: 10,
    windowMs: 60 * 60_000,
    identifier: member.id,
  }).catch(() => null);
  if (!limit?.ok) {
    return jsonError(429, "Too many uploads were started. Try again later.", {
      retryAfterSec: limit?.retryAfterSec ?? 0,
      challengeRequired: limit?.challengeRequired ?? false,
    });
  }

  const uploadId = randomUUID();
  const admin = supabaseAdmin();
  const { data: intent, error: reserveError } = await admin.rpc("reserve_song_upload", {
    p_intent_id: uploadId,
    p_vault_id: parsed.data.vaultId,
    p_member_id: member.id,
    p_title: parsed.data.title,
    p_declared_bytes: parsed.data.size,
  });
  if (reserveError || !intent) {
    if (reserveError?.message.includes("song_storage_limit_reached")) {
      return jsonError(409, "This Baul has reached its 10-uploaded-song limit.");
    }
    logOperationalEvent("song_upload_reservation_failed", { vault_id: parsed.data.vaultId });
    return jsonError(500, "Could not prepare the upload. Try again.");
  }

  const { data: signed, error: signedError } = await admin.storage
    .from("music")
    .createSignedUploadUrl(intent.object_key, { upsert: false });
  if (signedError || !signed) {
    await admin.from("media_upload_intents").delete().eq("id", intent.id).eq("status", "pending");
    return jsonError(500, "Could not prepare the upload. Try again.");
  }

  const result: SongUploadIntentResult = {
    uploadId: intent.id,
    path: signed.path,
    token: signed.token,
    expiresAt: intent.expires_at,
  };
  logOperationalEvent("song_upload_reserved", { vault_id: parsed.data.vaultId });
  return NextResponse.json(result, { status: 201, headers: { "Cache-Control": "private, no-store" } });
}
