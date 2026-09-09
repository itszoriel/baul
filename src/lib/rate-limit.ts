import "server-only";

import { identifierHash } from "./crypto";
import { turnstileSecret } from "./env";
import { supabaseAdmin } from "./supabase/admin";
import { logOperationalEvent } from "./observability";

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "local";
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = turnstileSecret();
  if (!secret) return process.env.NODE_ENV !== "production";
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return false;
  const result = (await response.json().catch(() => null)) as { success?: boolean } | null;
  return result?.success === true;
}

export async function rateLimit(
  req: Request,
  options: {
    name: string;
    max: number;
    windowMs: number;
    blockMs?: number;
    identifier?: string;
    turnstileToken?: string | null;
  },
): Promise<{ ok: boolean; retryAfterSec: number; challengeRequired: boolean }> {
  const ip = clientIp(req);
  const bucketKey = `${options.name}:${identifierHash(`${options.name}:${ip}:${options.identifier ?? "-"}`)}`;
  const { data, error } = await supabaseAdmin().rpc("consume_rate_limit", {
    p_bucket_key: bucketKey,
    p_limit: options.max,
    p_window_seconds: Math.max(1, Math.ceil(options.windowMs / 1000)),
    p_block_seconds: Math.max(1, Math.ceil((options.blockMs ?? options.windowMs) / 1000)),
  });
  if (error || !data?.[0]) throw new Error("rate_limiter_unavailable");

  const bucket = data[0];
  if (!bucket.allowed) {
    logOperationalEvent("rate_limit_blocked", { route: options.name, retry_after: bucket.retry_after_seconds });
    return { ok: false, retryAfterSec: bucket.retry_after_seconds, challengeRequired: true };
  }
  if (bucket.challenge_required && !(options.turnstileToken && (await verifyTurnstile(options.turnstileToken, ip)))) {
    logOperationalEvent("rate_limit_challenge", { route: options.name });
    return { ok: false, retryAfterSec: 0, challengeRequired: true };
  }
  return { ok: true, retryAfterSec: 0, challengeRequired: false };
}
