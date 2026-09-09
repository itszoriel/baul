import "server-only";

/**
 * Central env access. Server-only secrets are read lazily so the app can
 * boot (and the landing page render) before Supabase is configured, with
 * clear errors the moment a feature actually needs a missing value.
 */

export function supabaseUrl(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!v) throw new Error("Missing env NEXT_PUBLIC_SUPABASE_URL — see README 'Setup'.");
  return v;
}

/** Accepts the new publishable key (sb_publishable_...) or a legacy anon key. */
export function supabaseAnonKey(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!v) throw new Error("Missing env NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — see README 'Setup'.");
  return v;
}

/** Accepts the new secret key (sb_secret_...) or a legacy service-role key. */
export function supabaseServiceKey(): string {
  const v = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!v) throw new Error("Missing env SUPABASE_SECRET_KEY — see README 'Setup'.");
  return v;
}

/** 32+ char secret for email encryption, blind indexes and join tickets. */
export function appSecret(): string {
  const v = process.env.APP_SECRET;
  if (!v || v.length < 32) {
    throw new Error("APP_SECRET must be set to a random string of at least 32 chars — see README 'Setup'.");
  }
  return v;
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function turnstileSecret(): string | null {
  return process.env.TURNSTILE_SECRET_KEY ?? null;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}
