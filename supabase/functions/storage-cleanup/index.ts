import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const BATCH_SIZE = 50;

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function secretsMatch(received: string | null, expected: string): Promise<boolean> {
  if (!received) return false;
  const [left, right] = await Promise.all([digest(received), digest(expected)]);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
    },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const cleanupSecret = Deno.env.get("CLEANUP_SECRET");
  if (!projectUrl || !serviceRoleKey || !cleanupSecret) {
    console.error(JSON.stringify({ event: "storage_cleanup_misconfigured", at: new Date().toISOString() }));
    return json({ error: "Cleanup is not configured." }, 500);
  }
  if (!(await secretsMatch(request.headers.get("x-cleanup-secret"), cleanupSecret))) {
    return json({ error: "Unauthorized." }, 401);
  }

  const admin = createClient(projectUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const now = new Date().toISOString();
  let completed = 0;
  let deferred = 0;
  let abandonedRemoved = 0;

  const { data: jobs, error: jobsError } = await admin
    .from("storage_cleanup_queue")
    .select("id, bucket, object_key, attempt_count")
    .is("processed_at", null)
    .lte("available_at", now)
    .order("created_at")
    .limit(BATCH_SIZE);
  if (jobsError) {
    console.error(JSON.stringify({ event: "storage_cleanup_query_failed", at: now }));
    return json({ error: "Could not load cleanup jobs." }, 500);
  }

  for (const job of jobs ?? []) {
    const { error: removalError } = await admin.storage.from(job.bucket).remove([job.object_key]);
    if (!removalError) {
      await admin
        .from("storage_cleanup_queue")
        .update({ processed_at: new Date().toISOString(), last_error: null })
        .eq("id", job.id)
        .is("processed_at", null);
      completed += 1;
      continue;
    }

    const attempts = job.attempt_count + 1;
    const delayMinutes = Math.min(24 * 60, 2 ** Math.min(attempts, 10));
    await admin
      .from("storage_cleanup_queue")
      .update({
        attempt_count: attempts,
        available_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
        last_error: removalError.name.slice(0, 200),
      })
      .eq("id", job.id)
      .is("processed_at", null);
    deferred += 1;
  }

  const { data: expiredIntents, error: intentsError } = await admin
    .from("media_upload_intents")
    .select("id, bucket, object_key")
    .eq("status", "pending")
    .lte("expires_at", now)
    .order("created_at")
    .limit(BATCH_SIZE);
  if (intentsError) {
    console.error(JSON.stringify({ event: "upload_intent_cleanup_query_failed", at: now }));
    return json({ completed, deferred, error: "Could not load expired upload intents." }, 500);
  }

  for (const intent of expiredIntents ?? []) {
    const { error: removalError } = await admin.storage.from(intent.bucket).remove([intent.object_key]);
    if (removalError) {
      deferred += 1;
      continue;
    }
    const { error: deleteError } = await admin
      .from("media_upload_intents")
      .delete()
      .eq("id", intent.id)
      .eq("status", "pending");
    if (deleteError) deferred += 1;
    else abandonedRemoved += 1;
  }

  console.info(JSON.stringify({
    event: "storage_cleanup",
    at: new Date().toISOString(),
    completed,
    deferred,
    abandoned_removed: abandonedRemoved,
  }));
  return json({ completed, deferred, abandonedRemoved });
});
