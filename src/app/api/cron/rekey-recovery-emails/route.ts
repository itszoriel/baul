import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { decryptEmail, emailBlindIndex, encryptEmail, secretsMatch } from "@/lib/crypto";
import { logOperationalEvent } from "@/lib/observability";
import { supabaseAdmin } from "@/lib/supabase/admin";

const PAGE_SIZE = 500;

/**
 * Operator maintenance after rotating APP_SECRET (set APP_SECRET to the new
 * value and APP_SECRET_PREVIOUS to the old one, deploy, then call this with
 * `Authorization: Bearer $CRON_SECRET`). It re-encrypts every recovery email
 * and rewrites its blind index under the current secret. When it reports
 * `remaining: 0`, APP_SECRET_PREVIOUS can be removed.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return jsonError(500, "Cron is not configured.");
  if (!secretsMatch(req.headers.get("authorization"), `Bearer ${secret}`)) return jsonError(401, "Unauthorized.");

  const admin = supabaseAdmin();
  let checked = 0;
  let rekeyed = 0;
  let remaining = 0;
  let cursor = "00000000-0000-0000-0000-000000000000";

  for (;;) {
    const { data: vaults, error } = await admin
      .from("vaults")
      .select("id, recovery_email_enc, recovery_email_hash")
      .not("recovery_email_enc", "is", null)
      .gt("id", cursor)
      .order("id")
      .limit(PAGE_SIZE);
    if (error) return jsonError(500, "Could not load recovery emails.");
    if (!vaults?.length) break;

    for (const vault of vaults) {
      checked += 1;
      cursor = vault.id;
      try {
        const { email, current } = decryptEmail(vault.recovery_email_enc!);
        const index = emailBlindIndex(email);
        if (current && vault.recovery_email_hash === index) continue;
        const { error: updateError } = await admin
          .from("vaults")
          .update({ recovery_email_enc: encryptEmail(email), recovery_email_hash: index })
          .eq("id", vault.id);
        if (updateError) remaining += 1;
        else rekeyed += 1;
      } catch {
        // Not readable with any configured secret: leave it for investigation.
        remaining += 1;
      }
    }
    if (vaults.length < PAGE_SIZE) break;
  }

  logOperationalEvent("recovery_emails_rekeyed", { checked, rekeyed, remaining });
  return NextResponse.json({ checked, rekeyed, remaining }, { headers: { "Cache-Control": "private, no-store" } });
}
