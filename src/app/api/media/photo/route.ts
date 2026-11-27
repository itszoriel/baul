import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isSameOrigin, jsonError } from "@/lib/api";
import { LIMITS } from "@/lib/domain";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/authz";
import { validateWebpImage } from "@/lib/webp";

const MAX_BYTES = 10 * 1024 * 1024;

// The in-app uploader produces images of at most 2000px on the longest side.
const MAX_DIMENSION = 2048;

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, "Request origin was not accepted.");
  const form = await req.formData().catch(() => null);
  const vaultId = z.uuid().safeParse(form?.get("vaultId"));
  if (!vaultId.success) return jsonError(400, "Choose a valid Baul.");
  const access = await requireMember(vaultId.data);
  if (!access.ok) return access.response;
  const member = access.member;

  const limit = await rateLimit(req, {
    name: "photo-upload",
    identifier: { value: member.id, max: 10, windowMs: 60 * 60_000 },
  }).catch(() => null);
  if (!limit?.ok) {
    return jsonError(429, "Too many photos were uploaded. Try again later.", {
      retryAfterSec: limit?.retryAfterSec ?? 0,
    });
  }

  const admin = supabaseAdmin();
  const { count: photoCount, error: countError } = await admin
    .from("memories")
    .select("id", { count: "exact", head: true })
    .eq("vault_id", vaultId.data)
    .eq("kind", "photo");
  if (countError) return jsonError(500, "Could not check this Baul's photo allowance.");
  if ((photoCount ?? 0) >= LIMITS.photosPerVault) {
    return jsonError(409, `This Baul has reached its ${LIMITS.photosPerVault}-photo limit.`);
  }

  const file = form?.get("file");
  if (!(file instanceof File)) return jsonError(400, "No photo received.");
  if (file.size > MAX_BYTES) return jsonError(413, "That photo is too large (max 10MB).");
  const captionValue = form?.get("caption");
  const caption = typeof captionValue === "string" ? captionValue.trim().slice(0, 500) : null;
  const songValue = form?.get("songId");
  const songId = typeof songValue === "string" && songValue ? songValue : null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!validateWebpImage(bytes, MAX_DIMENSION).ok) return jsonError(415, "Photos must go through the in-app uploader.");

  if (songId) {
    if (!z.uuid().safeParse(songId).success) return jsonError(400, "Invalid soundtrack selection.");
    const { data: song } = await admin.from("songs").select("id").eq("id", songId).eq("vault_id", vaultId.data).maybeSingle();
    if (!song) return jsonError(400, "That song is not in this Baul.");
  }

  const memoryId = randomUUID();
  const key = `${vaultId.data}/${memoryId}.webp`;
  const { error: uploadError } = await admin.storage.from("photos").upload(key, bytes, { contentType: "image/webp" });
  if (uploadError) return jsonError(500, "Could not save the photo. Try again.");

  const { data: memory, error } = await admin.from("memories").insert({
    id: memoryId,
    vault_id: vaultId.data,
    member_id: member.id,
    kind: "photo",
    content: caption || null,
    media_url: `photos/${key}`,
    song_id: songId,
  }).select("id, vault_id, member_id, kind, content, media_url, song_id, unlock_at, created_at").single();

  if (error || !memory) {
    await admin.storage.from("photos").remove([key]);
    if (error?.message.includes("photo_limit_reached")) {
      return jsonError(409, `This Baul has reached its ${LIMITS.photosPerVault}-photo limit.`);
    }
    return jsonError(500, "Could not add this memory. Try again.");
  }
  return NextResponse.json({ memory }, { headers: { "Cache-Control": "private, no-store" } });
}
