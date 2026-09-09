"use client";

import { supabaseBrowser } from "./supabase/client";
import type { ApiError, VaultSummary } from "./domain";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code?: ApiError["code"],
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/** POST JSON to an API route; throws a typed, user-safe API error. */
export async function api<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const failure = data as Partial<ApiError>;
    throw new ApiRequestError(failure.error ?? "Something went wrong. Try again.", failure.code, failure.requestId);
  }
  return data as T;
}

/** POST FormData (uploads) to an API route. */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(path, { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Upload failed. Try again.");
  return data as T;
}

/** Members are anonymous auth users; make sure this browser has a LIVE one. */
export async function ensureAnonSession(): Promise<void> {
  const supabase = supabaseBrowser();
  // Validate against the server, not just localStorage. An anonymous user can
  // be deleted server-side while its JWT still sits in the browser — it looks
  // valid (getSession returns it) but every authenticated request 401s. getUser
  // round-trips to confirm the user still exists; if not, mint a fresh one.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) return;
  await supabase.auth.signOut().catch(() => {}); // clear the dead token first
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error("Could not start a session. Check your connection and try again.");
}

export interface JoinResult {
  memberId: string;
  vault: { id: string; name: string; vaultType: "intimate" | "circle" };
  needsPhraseUpgrade?: boolean;
}

/**
 * Redeem a join ticket. Authorization is resolved from the live membership
 * row associated with this anonymous Auth user.
 *
 * A first-time member passes displayName + passphrase (the passphrase lets
 * them reclaim this identity from another device). A returning member on the
 * SAME device passes neither — the server recognizes their session.
 */
export async function joinVault(joinToken: string, displayName?: string, passphrase?: string, turnstileToken?: string | null): Promise<JoinResult> {
  await ensureAnonSession();
  return api<JoinResult>("/api/vaults/join", { joinToken, displayName, passphrase, turnstileToken });
}

/**
 * Reclaim an existing member from a new device with username + passphrase.
 * Starts from a FRESH anonymous session so the rebind can't collide with a
 * seat this device already holds; the server then points the member row at it.
 */
export async function reclaimMember(joinToken: string, username: string, passphrase: string, turnstileToken?: string | null): Promise<JoinResult> {
  await ensureAnonSession();
  return api<JoinResult>("/api/vaults/reclaim", { joinToken, username, passphrase, turnstileToken });
}

export async function currentVaults(): Promise<VaultSummary[]> {
  // A fresh visitor has no anonymous session yet. Avoid turning that normal
  // landing-page state into a noisy 401 request; authenticated callers still
  // resolve membership from the server's live rows below.
  const {
    data: { session },
  } = await supabaseBrowser().auth.getSession();
  if (!session) return [];

  const response = await fetch("/api/me/vaults", { cache: "no-store" });
  if (!response.ok) return [];
  const data = (await response.json()) as { vaults?: VaultSummary[] };
  return data.vaults ?? [];
}

/** Resolve live membership, optionally for a specific Baul. */
export async function currentClaims(vaultId?: string): Promise<{ vaultId: string; memberId: string } | null> {
  const vaults = await currentVaults();
  const selected = vaultId ? vaults.find((vault) => vault.id === vaultId) : vaults.length === 1 ? vaults[0] : undefined;
  return selected ? { vaultId: selected.id, memberId: selected.memberId } : null;
}
