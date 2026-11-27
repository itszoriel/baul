import { describe, expect, it } from "vitest";
import { remoteDatabaseViolation } from "@/lib/remote-database-guard";

const hosted = "https://abcdefghijklmnop.supabase.co";

describe("remoteDatabaseViolation", () => {
  it("allows the local Supabase stack", () => {
    expect(remoteDatabaseViolation({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })).toBeNull();
    expect(remoteDatabaseViolation({ NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" })).toBeNull();
  });

  it("refuses a hosted project on a local machine", () => {
    expect(remoteDatabaseViolation({ NEXT_PUBLIC_SUPABASE_URL: hosted })).toContain("abcdefghijklmnop.supabase.co");
  });

  it("allows a hosted project on Vercel or after an explicit opt-in", () => {
    expect(remoteDatabaseViolation({ NEXT_PUBLIC_SUPABASE_URL: hosted, VERCEL: "1" })).toBeNull();
    expect(remoteDatabaseViolation({ NEXT_PUBLIC_SUPABASE_URL: hosted, BAUL_ALLOW_REMOTE_SUPABASE: "true" })).toBeNull();
  });

  it("ignores a missing URL so unconfigured builds keep their own errors", () => {
    expect(remoteDatabaseViolation({})).toBeNull();
  });
});
