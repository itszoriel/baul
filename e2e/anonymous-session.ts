import type { Page } from "@playwright/test";

// Mirrors @supabase/ssr's cookie storage: `sb-<ref>-auth-token`, base64url
// encoded with a `base64-` prefix, chunked above 3180 characters.
const MAX_CHUNK_SIZE = 3180;

/**
 * Give the page's browser context a live anonymous Supabase session, the same
 * way the app's create flow does before it creates a baul (the server binds
 * the new baul to its creator's session).
 */
export async function signInAnonymously(page: Page, appUrl = "http://127.0.0.1:3000"): Promise<void> {
  const supabaseUrl = process.env.E2E_SUPABASE_URL;
  const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    throw new Error("E2E_SUPABASE_URL and E2E_SUPABASE_PUBLISHABLE_KEY are set by playwright.config.ts for full runs.");
  }

  const storageKey = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
  // Keep an existing identity: one keeper may create several bauls.
  const existing = await page.context().cookies(appUrl);
  if (existing.some((cookie) => cookie.name === storageKey || cookie.name.startsWith(`${storageKey}.`))) return;

  const response = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) throw new Error(`Anonymous sign-in failed with HTTP ${response.status}.`);
  const session = (await response.json()) as { expires_in: number; expires_at?: number };
  session.expires_at ??= Math.floor(Date.now() / 1000) + session.expires_in;

  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  const cookies = value.length <= MAX_CHUNK_SIZE
    ? [{ name: storageKey, value, url: appUrl }]
    : Array.from({ length: Math.ceil(value.length / MAX_CHUNK_SIZE) }, (_, index) => ({
      name: `${storageKey}.${index}`,
      value: value.slice(index * MAX_CHUNK_SIZE, (index + 1) * MAX_CHUNK_SIZE),
      url: appUrl,
    }));
  await page.context().addCookies(cookies);
}
