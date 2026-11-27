const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Local runs (`next dev`, a local `next start`, Playwright) must not silently
 * read and write the hosted production project. Remote Supabase is allowed on
 * Vercel (which sets VERCEL=1 at build and runtime) or after an explicit,
 * deliberate opt-in.
 */
export function remoteDatabaseViolation(env: Record<string, string | undefined>): string | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return null;
  }
  if (LOOPBACK_HOSTS.has(hostname)) return null;
  if (env.VERCEL === "1" || env.BAUL_ALLOW_REMOTE_SUPABASE === "true") return null;
  return `Refusing to run against remote Supabase host "${hostname}" outside Vercel. `
    + "Use the local stack (npm run db:start, then put its URL and keys in .env.local), "
    + "or set BAUL_ALLOW_REMOTE_SUPABASE=true if you deliberately want this machine to use that project.";
}
