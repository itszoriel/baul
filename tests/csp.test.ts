import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, requiresNonce } from "@/lib/csp";

describe("content security policy", () => {
  it("permits only the fixed YouTube script origin in development", () => {
    const policy = buildContentSecurityPolicy({ nonce: "test-nonce", development: true });

    expect(policy).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com");
    expect(policy).not.toContain("script-src *");
    expect(policy).not.toContain("https://*.google.com");
  });

  it("keeps the production nonce trust chain without unsafe script execution", () => {
    const policy = buildContentSecurityPolicy({ nonce: "test-nonce", development: false });
    const scriptDirective = policy.split("; ").find((directive) => directive.startsWith("script-src "));

    expect(scriptDirective).toBe(
      "script-src 'self' 'nonce-test-nonce' 'strict-dynamic' https://www.youtube.com",
    );
    expect(scriptDirective).not.toContain("'unsafe-inline'");
    expect(scriptDirective).not.toContain("'unsafe-eval'");
    expect(scriptDirective).not.toContain("*");
    expect(policy).toContain("script-src-attr 'none'");
    expect(policy).toContain("upgrade-insecure-requests");
  });

  it("uses a static-compatible policy only when no nonce is supplied", () => {
    const policy = buildContentSecurityPolicy({ development: false });
    const scriptDirective = policy.split("; ").find((directive) => directive.startsWith("script-src "));
    expect(scriptDirective).toBe("script-src 'self' 'unsafe-inline'");
    expect(scriptDirective).not.toContain("'unsafe-eval'");
  });

  it("does not upgrade local HTTP subresources during production smoke tests", () => {
    const policy = buildContentSecurityPolicy({
      development: false,
      secureTransport: false,
      supabaseUrl: "http://127.0.0.1:54321",
    });
    expect(policy).not.toContain("upgrade-insecure-requests");
    expect(policy).toContain("connect-src 'self' https://*.supabase.co wss://*.supabase.co http://127.0.0.1:54321 ws://127.0.0.1:54321");
    expect(policy).toContain("img-src 'self' data: blob: https://*.supabase.co http://127.0.0.1:54321");
    expect(policy).toContain("media-src 'self' blob: https: http://127.0.0.1:54321");
  });

  it("does not broaden the policy for an insecure remote Supabase URL", () => {
    const policy = buildContentSecurityPolicy({
      development: false,
      supabaseUrl: "http://supabase.example.test:54321",
    });
    expect(policy).not.toContain("supabase.example.test");
  });

  it("classifies every private or token-bearing page for nonce rendering", () => {
    for (const path of ["/create", "/enter", "/invite/token", "/recover/confirm", "/vault", "/vault/id", "/vaults"]) {
      expect(requiresNonce(path)).toBe(true);
    }
    for (const path of ["/", "/privacy", "/terms", "/acceptable-use", "/support", "/missing"]) {
      expect(requiresNonce(path)).toBe(false);
    }
  });
});
