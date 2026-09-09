import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isSameOrigin, jsonError, pathVaultId, splitStoragePath } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireVaultSession } from "@/lib/supabase/server";

const Body = z.object({ paths: z.array(z.string().max(300)).min(1).max(50) });

// Avatars render everywhere → long expiry + client cache (spec §2.4).
const EXPIRY: Record<string, number> = { avatars: 24 * 60 * 60, stickers: 24 * 60 * 60, photos: 60 * 60, music: 60 * 60 };

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, "Request origin was not accepted.");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Invalid request.");
  const requestedVaultId = pathVaultId(parsed.data.paths[0] ?? "");
  if (!requestedVaultId) return jsonError(400, "Invalid media path.");
  const session = await requireVaultSession(requestedVaultId);
  if (!session.ok) return jsonError(session.status, session.error);

  const byBucket = new Map<string, string[]>();
  for (const path of parsed.data.paths) {
    // A session may only sign media inside its own vault.
    if (pathVaultId(path) !== session.claims.vaultId) return jsonError(403, "Path outside your baul.");
    const split = splitStoragePath(path);
    if (!split) return jsonError(400, "Invalid media path.");
    byBucket.set(split.bucket, [...(byBucket.get(split.bucket) ?? []), split.key]);
  }

  const urls: Record<string, { url: string; expiresIn: number }> = {};
  for (const [bucket, keys] of byBucket) {
    const expiresIn = EXPIRY[bucket] ?? 3600;
    const { data, error } = await supabaseAdmin().storage.from(bucket).createSignedUrls(keys, expiresIn);
    if (error) return jsonError(500, "Could not sign media URLs.");
    for (const item of data ?? []) {
      if (item.signedUrl && item.path) {
        urls[`${bucket}/${item.path}`] = { url: item.signedUrl, expiresIn };
      }
    }
  }
  return NextResponse.json({ urls }, { headers: { "Cache-Control": "private, no-store" } });
}
