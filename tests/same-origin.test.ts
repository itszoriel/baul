import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/observability", () => ({ logOperationalEvent: vi.fn() }));
const { isSameOrigin } = await import("@/lib/api");

function post(url: string, headers: Record<string, string>): Request {
  return new Request(url, { method: "POST", headers });
}

afterEach(() => vi.unstubAllEnvs());

describe("isSameOrigin", () => {
  it("accepts the request's own origin", () => {
    expect(isSameOrigin(post("https://baul.test/api/x", { origin: "https://baul.test" }))).toBe(true);
  });

  it("accepts the configured canonical origin when the server sees another host", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://127.0.0.1:3000");
    expect(isSameOrigin(post("http://localhost:3000/api/x", { origin: "http://127.0.0.1:3000" }))).toBe(true);
  });

  it("rejects any other origin", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://baul.test");
    expect(isSameOrigin(post("https://baul.test/api/x", { origin: "https://evil.test" }))).toBe(false);
    expect(isSameOrigin(post("https://baul.test/api/x", { origin: "null" }))).toBe(false);
  });

  it("falls back to Sec-Fetch-Site, then refuses cookie-bearing requests with no origin signal", () => {
    expect(isSameOrigin(post("https://baul.test/api/x", { "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isSameOrigin(post("https://baul.test/api/x", { "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOrigin(post("https://baul.test/api/x", { cookie: "sb=1" }))).toBe(false);
  });
});
