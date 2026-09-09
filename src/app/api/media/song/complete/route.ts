import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin, jsonError, loadMember } from "@/lib/api";
import { LIMITS, songUploadCompletionSchema } from "@/lib/domain";
import { isMp3, totalObjectBytes } from "@/lib/media";
import { logOperationalEvent } from "@/lib/observability";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireVaultSession } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, "Request origin was not accepted.");
  const parsed = songUploadCompletionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Choose a valid upload.");

  const admin = supabaseAdmin();
  const { data: intent, error: intentError } = await admin
    .from("media_upload_intents")
    .select("id, vault_id, member_id, bucket, object_key, declared_bytes, status, song_id, expires_at")
    .eq("id", parsed.data.uploadId)
    .maybeSingle();
  if (intentError) return jsonError(500, "Could not verify the upload. Try again.");
  if (!intent) return jsonError(404, "That upload is no longer available.");

  const session = await requireVaultSession(intent.vault_id);
  if (!session.ok) return jsonError(session.status, session.error);
  const member = await loadMember(intent.vault_id, session.claims.memberId);
  if (!member || member.id !== intent.member_id) return jsonError(403, "This upload belongs to another keeper.");

  const limit = await rateLimit(req, {
    name: "song-upload-complete",
    max: 30,
    windowMs: 60 * 60_000,
    identifier: member.id,
  }).catch(() => null);
  if (!limit?.ok) {
    return jsonError(429, "Too many upload checks were requested. Try again later.", {
      retryAfterSec: limit?.retryAfterSec ?? 0,
    });
  }

  if (intent.status === "completed" && intent.song_id) {
    const { data: song } = await admin
      .from("songs")
      .select("id, vault_id, added_by, title, source_url, file_url, created_at")
      .eq("id", intent.song_id)
      .maybeSingle();
    if (song) return NextResponse.json({ song }, { headers: { "Cache-Control": "private, no-store" } });
  }

  if (new Date(intent.expires_at).getTime() <= Date.now()) {
    return jsonError(400, "That upload has expired. Choose the file again.");
  }

  const { data: signed, error: signedError } = await admin.storage
    .from(intent.bucket)
    .createSignedUrl(intent.object_key, 60);
  if (signedError || !signed) return jsonError(400, "The uploaded file could not be found.");

  const fileResponse = await fetch(signed.signedUrl, {
    headers: { Range: "bytes=0-11" },
    cache: "no-store",
  }).catch(() => null);
  if (!fileResponse?.ok) return jsonError(400, "The uploaded file could not be read.");

  const bytes = new Uint8Array(await fileResponse.arrayBuffer());
  const actualBytes = totalObjectBytes(fileResponse.headers);
  const contentType = fileResponse.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase();
  const validType = contentType === "audio/mpeg" || contentType === "audio/mp3" || contentType === "application/octet-stream";
  const validSize = actualBytes !== null && actualBytes === intent.declared_bytes && actualBytes <= LIMITS.songBytes;
  if (!validType || !validSize || !isMp3(bytes)) {
    await admin.storage.from(intent.bucket).remove([intent.object_key]);
    await admin.from("media_upload_intents").delete().eq("id", intent.id).eq("status", "pending");
    return jsonError(415, "That upload is not a valid MP3 file.");
  }

  const { data: song, error: completionError } = await admin.rpc("complete_song_upload", {
    p_intent_id: intent.id,
    p_member_id: member.id,
  });
  if (completionError || !song) {
    logOperationalEvent("song_upload_completion_failed", { vault_id: intent.vault_id });
    return jsonError(500, "Could not add the uploaded song. Try again.");
  }

  logOperationalEvent("song_upload_completed", { vault_id: intent.vault_id, bytes: actualBytes });
  return NextResponse.json({ song }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
}
