import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isSameOrigin, jsonError, loadMember } from '@/lib/api';
import { stickerNameSchema } from '@/lib/domain';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireVaultSession } from '@/lib/supabase/server';
import { webpDimensions } from '@/lib/webp';

const MAX_BYTES = 512 * 1024;
const MAX_DIMENSION = 512;

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, 'Request origin was not accepted.');
  const form = await req.formData().catch(() => null);
  const vaultId = z.uuid().safeParse(form?.get('vaultId'));
  const name = stickerNameSchema.safeParse(form?.get('name'));
  if (!vaultId.success) return jsonError(400, 'Choose a valid Baul.');
  if (!name.success) return jsonError(400, name.error.issues[0]?.message ?? 'Give your sticker a valid name.');

  const session = await requireVaultSession(vaultId.data);
  if (!session.ok) return jsonError(session.status, session.error);
  const member = await loadMember(vaultId.data, session.claims.memberId);
  if (!member) return jsonError(403, 'No active keeper access to this baul.');

  const file = form?.get('file');
  if (!(file instanceof File)) return jsonError(400, 'No sticker received.');
  if (file.size > MAX_BYTES) return jsonError(413, 'That sticker is too large (max 512KB).');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const dimensions = webpDimensions(bytes);
  if (!dimensions) return jsonError(415, 'Stickers must go through the in-app uploader.');
  if (dimensions.width > MAX_DIMENSION || dimensions.height > MAX_DIMENSION) {
    return jsonError(413, 'That sticker has dimensions that are too large.');
  }

  const admin = supabaseAdmin();
  const stickerId = randomUUID();
  const key = `${vaultId.data}/${stickerId}.webp`;
  const storagePath = `stickers/${key}`;
  const { error: uploadError } = await admin.storage.from('stickers').upload(key, bytes, {
    contentType: 'image/webp',
    cacheControl: '31536000',
  });
  if (uploadError) return jsonError(500, 'Could not save the sticker. Try again.');

  const { data: sticker, error } = await admin.rpc('create_vault_sticker', {
    target_id: stickerId,
    target_vault_id: vaultId.data,
    target_member_id: member.id,
    sticker_name: name.data,
    target_storage_path: storagePath,
  });
  if (error || !sticker) {
    await admin.storage.from('stickers').remove([key]);
    if (error?.code === '23505') return jsonError(409, 'This Baul already has a sticker with that name.');
    if (error?.message.includes('sticker_limit_reached')) return jsonError(409, 'This Baul has reached its 50-sticker limit.');
    return jsonError(500, 'Could not add the sticker. Try again.');
  }

  return NextResponse.json(
    { sticker },
    { status: 201, headers: { 'Cache-Control': 'private, no-store' } },
  );
}
