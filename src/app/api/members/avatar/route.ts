import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isSameOrigin, jsonError } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/authz";
import { validateWebpImage } from "@/lib/webp";

const MAX_BYTES = 5 * 1024 * 1024;

// The in-app cropper produces 512x512 avatars.
const MAX_DIMENSION = 512;

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, "Request origin was not accepted.");
  const form = await req.formData().catch(() => null);
  const vaultId = z.uuid().safeParse(form?.get("vaultId"));
  if (!vaultId.success) return jsonError(400, "Choose a valid Baul.");
  const access = await requireMember(vaultId.data);
  if (!access.ok) return access.response;
  const member = access.member;

  const file = form?.get("file");
  if (!(file instanceof File)) return jsonError(400, "No image received.");
  if (file.size > MAX_BYTES) return jsonError(413, "That image is too large (max 5MB).");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!validateWebpImage(bytes, MAX_DIMENSION).ok) return jsonError(415, "Use the in-app photo cropper to set your avatar.");

  const admin = supabaseAdmin();
  const key = `${vaultId.data}/${member.id}.webp`;
  const { error: uploadError } = await admin.storage.from("avatars").upload(key, bytes, { contentType: "image/webp", upsert: true });
  if (uploadError) return jsonError(500, "Could not save your photo. Try again.");
  const path = `avatars/${key}`;
  const { error } = await admin.from("members").update({ avatar_url: path }).eq("id", member.id);
  if (error) return jsonError(500, "Could not update your keeper photo.");
  return NextResponse.json({ path }, { headers: { "Cache-Control": "private, no-store" } });
}
