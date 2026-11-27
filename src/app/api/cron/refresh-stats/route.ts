import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { secretsMatch } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logOperationalEvent } from "@/lib/observability";

/**
 * Manual fallback for the aggregate refresh. The scheduled refresh runs in
 * Supabase pg_cron every 10 minutes (`baul-refresh-public-stats`); call this
 * with `Authorization: Bearer $CRON_SECRET` only to force a refresh.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return jsonError(500, "CRON_SECRET is not configured.");
  if (!secretsMatch(req.headers.get("authorization"), `Bearer ${secret}`)) return jsonError(401, "Unauthorized.");

  const { error } = await supabaseAdmin().rpc("refresh_region_stats");
  if (error) return jsonError(500, "Could not refresh aggregate statistics.");
  logOperationalEvent("aggregate_stats_refreshed");
  return NextResponse.json({ refreshed: true, at: new Date().toISOString() });
}
