import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "../database.types";
import { supabaseAnonKey, supabaseUrl } from "../env";
import type { SessionClaims } from "../types";
import { supabaseAdmin } from "./admin";

/** Cookie-based client for route handlers / server components. */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a server component — safe to ignore, middleware not needed
          // because the browser client refreshes its own session.
        }
      },
    },
  });
}

/**
 * Authenticated caller for API routes: validates the anonymous Auth user and
 * resolves its active membership live. JWT metadata is never authoritative.
 */
export async function requireVaultSession(targetVaultId: string): Promise<
  | { ok: true; userId: string; claims: SessionClaims }
  | { ok: false; status: number; error: string }
> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Not signed in." };
  const { data, error } = await supabaseAdmin()
    .from("members")
    .select("id, vault_id")
    .eq("user_id", user.id)
    .eq("vault_id", targetVaultId)
    .is("revoked_at", null)
    .order("joined_at", { ascending: true })
    .limit(1);
  if (error || !data || data.length === 0) {
    return { ok: false, status: 403, error: "No active keeper access to this baul." };
  }
  const membership = data[0];
  if (!membership) return { ok: false, status: 403, error: "No active keeper access to this baul." };
  return {
    ok: true,
    userId: user.id,
    claims: { vaultId: membership.vault_id, memberId: membership.id },
  };
}
