import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Member } from "@/lib/types";

const requireVaultSession = vi.fn();
const loadMember = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ requireVaultSession }));
vi.mock("@/lib/observability", () => ({ logOperationalEvent: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  loadMember,
}));

const { requireMember } = await import("@/lib/authz");

const VAULT = "10000000-0000-0000-0000-000000000001";
const OTHER_VAULT = "20000000-0000-0000-0000-000000000002";

function member(overrides: Partial<Member> = {}): Member {
  return {
    id: "11000000-0000-0000-0000-000000000001",
    vault_id: VAULT,
    display_name: "Keeper",
    name_changed_at: null,
    avatar_url: null,
    avatar_color: "#AABBCC",
    role: "member",
    joined_at: "2026-11-01T00:00:00Z",
    revoked_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  requireVaultSession.mockReset();
  loadMember.mockReset();
  requireVaultSession.mockResolvedValue({
    ok: true,
    userId: "aaaaaaaa-0000-0000-0000-000000000001",
    claims: { vaultId: VAULT, memberId: member().id },
  });
});

describe("requireMember", () => {
  it("rejects a caller without a session", async () => {
    requireVaultSession.mockResolvedValue({ ok: false, status: 401, error: "Not signed in." });
    const result = await requireMember(VAULT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(loadMember).not.toHaveBeenCalled();
  });

  it("rejects a session with no live membership in the vault", async () => {
    requireVaultSession.mockResolvedValue({ ok: false, status: 403, error: "No active keeper access to this baul." });
    const result = await requireMember(OTHER_VAULT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("rejects a revoked or missing member row", async () => {
    loadMember.mockResolvedValue(null);
    const result = await requireMember(VAULT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("rejects a member row that belongs to another vault", async () => {
    loadMember.mockResolvedValue(member({ vault_id: OTHER_VAULT }));
    const result = await requireMember(VAULT);
    expect(result.ok).toBe(false);
  });

  it("rejects a non-admin on an admin action with the route's message", async () => {
    loadMember.mockResolvedValue(member());
    const result = await requireMember(VAULT, { admin: true, forbidden: "Only an admin keeper can invite someone." });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect((await result.response.json()).error).toBe("Only an admin keeper can invite someone.");
    }
  });

  it("admits an active member, and an admin on admin actions", async () => {
    loadMember.mockResolvedValue(member());
    expect((await requireMember(VAULT)).ok).toBe(true);
    loadMember.mockResolvedValue(member({ role: "admin" }));
    const result = await requireMember(VAULT, { admin: true });
    expect(result.ok && result.member.role).toBe("admin");
  });
});
