import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logOperationalEvent } from "@/lib/observability";

/**
 * Recomputes region_stats — the ONLY data the public globe reads (spec §2.5).
 * Wired to Vercel Cron every 10 minutes (vercel.json); Vercel sends
 * `Authorization: Bearer ${CRON_SECRET}` automatically. pg_cron inside
 * Supabase is an equivalent alternative (see the migration file).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return jsonError(500, "CRON_SECRET is not configured.");
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return jsonError(401, "Unauthorized.");

  const { error } = await supabaseAdmin().rpc("refresh_region_stats");
  if (error) return jsonError(500, "Could not refresh aggregate statistics.");
  logOperationalEvent("aggregate_stats_refreshed");
  return NextResponse.json({ refreshed: true, at: new Date().toISOString() });
}
