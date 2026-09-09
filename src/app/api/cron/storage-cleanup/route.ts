import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { logOperationalEvent } from "@/lib/observability";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return jsonError(500, "Cron is not configured.");
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return jsonError(401, "Unauthorized.");

  const admin = supabaseAdmin();
  const { data: jobs, error } = await admin
    .from("storage_cleanup_queue")
    .select("id, bucket, object_key, attempt_count")
    .is("processed_at", null)
    .lte("available_at", new Date().toISOString())
    .order("created_at")
    .limit(50);
  if (error) return jsonError(500, "Could not load cleanup jobs.");

  let completed = 0;
  let deferred = 0;
  for (const job of jobs ?? []) {
    const { error: removalError } = await admin.storage.from(job.bucket).remove([job.object_key]);
    if (!removalError) {
      await admin.from("storage_cleanup_queue").update({ processed_at: new Date().toISOString(), last_error: null }).eq("id", job.id).is("processed_at", null);
      completed += 1;
      continue;
    }

    const attempts = job.attempt_count + 1;
    const delayMinutes = Math.min(24 * 60, 2 ** Math.min(attempts, 10));
    await admin.from("storage_cleanup_queue").update({
      attempt_count: attempts,
      available_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
      last_error: removalError.name.slice(0, 200),
    }).eq("id", job.id).is("processed_at", null);
    deferred += 1;
  }

  logOperationalEvent("storage_cleanup", { completed, deferred });
  return NextResponse.json({ completed, deferred }, { headers: { "Cache-Control": "private, no-store" } });
}
