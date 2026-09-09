import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isSameOrigin, jsonError, loadMember } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireVaultSession } from "@/lib/supabase/server";

const MAX_BYTES = 5 * 1024 * 1024;

function isWebp(buf: Uint8Array): boolean {
  return buf.length > 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
    && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, "Request origin was not accepted.");
  const form = await req.formData().catch(() => null);
  const vaultId = z.uuid().safeParse(form?.get("vaultId"));
  if (!vaultId.success) return jsonError(400, "Choose a valid Baul.");
  const session = await requireVaultSession(vaultId.data);
  if (!session.ok) return jsonError(session.status, session.error);
  const member = await loadMember(vaultId.data, session.claims.memberId);
  if (!member) return jsonError(403, "No active keeper access to this baul.");

  const file = form?.get("file");
  if (!(file instanceof File)) return jsonError(400, "No image received.");
  if (file.size > MAX_BYTES) return jsonError(413, "That image is too large (max 5MB).");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isWebp(bytes)) return jsonError(415, "Use the in-app photo cropper to set your avatar.");

  const admin = supabaseAdmin();
  const key = `${vaultId.data}/${member.id}.webp`;
  const { error: uploadError } = await admin.storage.from("avatars").upload(key, bytes, { contentType: "image/webp", upsert: true });
  if (uploadError) return jsonError(500, "Could not save your photo. Try again.");
  const path = `avatars/${key}`;
  const { error } = await admin.from("members").update({ avatar_url: path }).eq("id", member.id);
  if (error) return jsonError(500, "Could not update your keeper photo.");
  return NextResponse.json({ path }, { headers: { "Cache-Control": "private, no-store" } });
}
