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

export interface LimitRule {
  max: number;
  windowMs: number;
  blockMs?: number;
}

/**
 * Consume up to two independent buckets:
 * - `ip`: one bucket per client IP, so varying request values cannot mint
 *   fresh buckets (and fresh rows) from a single source.
 * - `identifier`: one bucket per value shared across ALL IPs (a member, an
 *   email recipient, a keeper), so rotating IPs cannot multiply attempts.
 *
 * `challenge` enables Turnstile escalation at half the limit. Only routes
 * whose UI can render the challenge may set it; otherwise the limiter would
 * silently halve their allowance.
 */
export async function rateLimit(
  req: Request,
  options: {
    name: string;
    ip?: LimitRule;
    identifier?: LimitRule & { value: string };
    challenge?: boolean;
    turnstileToken?: string | null;
  },
): Promise<{ ok: boolean; retryAfterSec: number; challengeRequired: boolean }> {
  const ip = clientIp(req);
  const buckets: Array<{ key: string; rule: LimitRule }> = [];
  if (options.ip) {
    buckets.push({ key: `${options.name}:ip:${identifierHash(`${options.name}:ip:${ip}`)}`, rule: options.ip });
  }
  if (options.identifier) {
    buckets.push({
      key: `${options.name}:id:${identifierHash(`${options.name}:id:${options.identifier.value}`)}`,
      rule: options.identifier,
    });
  }
  if (buckets.length === 0) throw new Error("rate_limit_misconfigured");

  let challengeReached = false;
  // The IP bucket is consumed first: a source that is already blocked must not
  // keep spending a shared identifier's allowance (and locking out its owner).
  for (const { key, rule } of buckets) {
    const { data, error } = await supabaseAdmin().rpc("consume_rate_limit", {
      p_bucket_key: key,
      p_limit: rule.max,
      p_window_seconds: Math.max(1, Math.ceil(rule.windowMs / 1000)),
      p_block_seconds: Math.max(1, Math.ceil((rule.blockMs ?? rule.windowMs) / 1000)),
    });
    if (error || !data?.[0]) throw new Error("rate_limiter_unavailable");
    const bucket = data[0];
    if (!bucket.allowed) {
      logOperationalEvent("rate_limit_blocked", { route: options.name, retry_after: bucket.retry_after_seconds });
      return { ok: false, retryAfterSec: bucket.retry_after_seconds, challengeRequired: Boolean(options.challenge) };
    }
    if (bucket.challenge_required) challengeReached = true;
  }

  if (options.challenge && challengeReached
    && !(options.turnstileToken && (await verifyTurnstile(options.turnstileToken, ip)))) {
    logOperationalEvent("rate_limit_challenge", { route: options.name });
    return { ok: false, retryAfterSec: 0, challengeRequired: true };
  }
  return { ok: true, retryAfterSec: 0, challengeRequired: false };
}
