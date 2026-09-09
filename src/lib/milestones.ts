import type { Member, Memory, Vault } from "./types";

export interface Milestone {
  id: string;
  label: string;
  value: string;
  hint?: string;
}

const DAY = 86_400_000;

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / DAY);
}

function fmt(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

/** Next monthly recurrence of the vault's start date (monthsary). */
function nextMonthly(start: Date, now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), start.getDate());
  if (d <= now) d.setMonth(d.getMonth() + 1);
  return d;
}

function nextYearly(start: Date, now: Date): Date {
  const d = new Date(now.getFullYear(), start.getMonth(), start.getDate());
  if (d <= now) d.setFullYear(d.getFullYear() + 1);
  return d;
}

export function computeMilestones(vault: Vault, memories: Memory[], members: Member[]): Milestone[] {
  const now = new Date();
  const madeAt = new Date(vault.created_at);
  const start = vault.milestone_date ? new Date(`${vault.milestone_date}T00:00:00`) : madeAt;
  const days = daysBetween(start, now);

  if (vault.vault_type === "intimate") {
    if (!vault.milestone_date) {
      return [{ id: "days", label: "days since this Baul was made", value: String(Math.max(daysBetween(madeAt, now), 0)), hint: `since ${fmt(madeAt)}` }];
    }
    const monthsary = nextMonthly(start, now);
    const anniversary = nextYearly(start, now);
    const out: Milestone[] = [
      { id: "days", label: "days together", value: String(Math.max(days, 0)), hint: `since ${fmt(start)}` },
      {
        id: "monthsary",
        label: "next monthsary",
        value: fmt(monthsary),
        hint: `in ${daysBetween(now, monthsary)} day${daysBetween(now, monthsary) === 1 ? "" : "s"}`,
      },
      {
        id: "anniversary",
        label: "next anniversary",
        value: fmt(anniversary),
        hint: `in ${daysBetween(now, anniversary)} days`,
      },
    ];
    const letters = memories.filter((m) => m.kind === "letter").length;
    if (letters > 0) out.push({ id: "letters", label: "letters kept", value: String(letters) });
    return out;
  }

  // Circle vault milestones.
  const out: Milestone[] = [];
  const yearsOld = Math.floor(days / 365);
  out.push(
    yearsOld >= 1
      ? { id: "age", label: "of this baul", value: `${yearsOld} year${yearsOld === 1 ? "" : "s"}`, hint: `since ${fmt(start)}` }
      : { id: "age", label: "days of this baul", value: String(Math.max(days, 0)), hint: `since ${fmt(start)}` },
  );

  const count = memories.length;
  const tiers = [10, 25, 50, 100, 250, 500, 1000];
  const reached = [...tiers].reverse().find((t) => count >= t);
  const next = tiers.find((t) => count < t);
  if (reached) {
    out.push({ id: "milestone", label: "memories milestone", value: `${reached}+`, hint: `${count} and counting` });
  } else if (next) {
    out.push({ id: "toward", label: `toward ${next} memories`, value: String(count), hint: `${next - count} to go` });
  }

  out.push({ id: "members", label: "keepers of this baul", value: String(members.length) });
  return out;
}
