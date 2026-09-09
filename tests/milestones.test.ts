import { afterEach, describe, expect, it, vi } from "vitest";
import { computeMilestones } from "@/lib/milestones";
import type { Vault } from "@/lib/types";

const base: Vault = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "Test",
  vault_type: "intimate",
  purpose: "romance",
  max_members: 2,
  milestone_date: null,
  created_at: "2026-08-01T00:00:00.000Z",
};

afterEach(() => vi.useRealTimers());

describe("milestone wording", () => {
  it("does not imply a relationship date when none was supplied", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T12:00:00.000Z"));
    const [milestone] = computeMilestones(base, [], []);
    expect(milestone?.label).toBe("days since this Baul was made");
  });

  it("uses days together only for an explicit milestone date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T12:00:00.000Z"));
    const [milestone] = computeMilestones({ ...base, milestone_date: "2026-01-01" }, [], []);
    expect(milestone?.label).toBe("days together");
  });
});
