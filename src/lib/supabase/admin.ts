import "server-only";

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { supabaseServiceKey, supabaseUrl } from "../env";

/**
 * Service-role client. SERVER ONLY — never import from client components.
 * Bypasses RLS; used by API routes for privileged operations (key hashing,
 * membership, uploads, claim updates).
 */
let cached: SupabaseClient<Database> | null = null;

export function supabaseAdmin(): SupabaseClient<Database> {
  if (!cached) {
    cached = createClient<Database>(supabaseUrl(), supabaseServiceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
