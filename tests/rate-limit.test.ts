import { beforeEach, describe, expect, it, vi } from "vitest";

type Bucket = { allowed: boolean; retry_after_seconds: number; current_hits: number; challenge_required: boolean };

const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => ({ rpc }) }));
vi.mock("@/lib/observability", () => ({ logOperationalEvent: vi.fn() }));

const { rateLimit } = await import("@/lib/rate-limit");

function request(ip: string): Request {
  return new Request("https://baul.test/api", { headers: { "x-forwarded-for": ip } });
}

function respond(...buckets: Bucket[]) {
  for (const bucket of buckets) rpc.mockResolvedValueOnce({ data: [bucket], error: null });
}

const open: Bucket = { allowed: true, retry_after_seconds: 0, current_hits: 1, challenge_required: false };
const atThreshold: Bucket = { ...open, challenge_required: true };
const blocked: Bucket = { allowed: false, retry_after_seconds: 60, current_hits: 11, challenge_required: true };

function bucketKeys(): string[] {
  return rpc.mock.calls.map((call) => (call[1] as { p_bucket_key: string }).p_bucket_key);
}

beforeEach(() => {
  rpc.mockReset();
  vi.stubEnv("APP_SECRET", "unit-test-app-secret-with-at-least-32-characters");
});

describe("rateLimit", () => {
  it("keeps the IP bucket independent of request-supplied identifiers", async () => {
    respond(open, open, open, open);
    const rule = { max: 3, windowMs: 60_000 };
    await rateLimit(request("203.0.113.1"), { name: "create-vault", ip: rule, identifier: { value: "a@example.test", ...rule } });
    await rateLimit(request("203.0.113.1"), { name: "create-vault", ip: rule, identifier: { value: "b@example.test", ...rule } });
    const [ipA, idA, ipB, idB] = bucketKeys();
    expect(ipA).toBe(ipB);
    expect(idA).not.toBe(idB);
  });

  it("shares an identifier bucket across IPs", async () => {
    respond(open, open);
    const identifier = { value: "victim@example.test", max: 3, windowMs: 60_000 };
    await rateLimit(request("203.0.113.1"), { name: "recovery-request", identifier });
    await rateLimit(request("198.51.100.7"), { name: "recovery-request", identifier });
    const [first, second] = bucketKeys();
    expect(first).toBe(second);
  });

  it("stops at a blocked IP bucket without spending the identifier's allowance", async () => {
    respond(blocked);
    const result = await rateLimit(request("203.0.113.1"), {
      name: "reclaim-member",
      ip: { max: 10, windowMs: 60_000 },
      identifier: { value: "vault:keeper", max: 5, windowMs: 60_000 },
      challenge: true,
    });
    expect(result.ok).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("does not halve the allowance of routes without a challenge UI", async () => {
    respond(atThreshold);
    const result = await rateLimit(request("203.0.113.1"), {
      name: "photo-upload",
      identifier: { value: "member", max: 10, windowMs: 60_000 },
    });
    expect(result.ok).toBe(true);
  });

  it("requires a challenge at the threshold on challenge-enabled routes", async () => {
    respond(atThreshold);
    const result = await rateLimit(request("203.0.113.1"), {
      name: "verify-key",
      ip: { max: 10, windowMs: 60_000 },
      challenge: true,
    });
    expect(result).toEqual({ ok: false, retryAfterSec: 0, challengeRequired: true });
  });

  it("rejects a limiter call with no buckets", async () => {
    await expect(rateLimit(request("203.0.113.1"), { name: "misconfigured" })).rejects.toThrow("rate_limit_misconfigured");
  });
});
