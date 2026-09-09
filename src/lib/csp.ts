const YOUTUBE_SCRIPT_ORIGIN = "https://www.youtube.com";

export function buildContentSecurityPolicy({
  nonce,
  development,
  secureTransport = true,
}: {
  nonce?: string;
  development: boolean;
  secureTransport?: boolean;
}): string {
  // YouTube is the only third-party script origin. Production keeps the
  // nonce trust chain; the explicit host is a fallback for older CSP clients.
  const scriptSource = development
    ? `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${YOUTUBE_SCRIPT_ORIGIN}`
    : nonce
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${YOUTUBE_SCRIPT_ORIGIN}`
      : "script-src 'self' 'unsafe-inline'";
  const styleSource = development
    ? "style-src 'self' 'unsafe-inline'"
    : nonce
      ? `style-src 'self' 'nonce-${nonce}'; style-src-attr 'unsafe-inline'`
      : "style-src 'self'; style-src-attr 'unsafe-inline'";
  const directives = [
    "default-src 'self'",
    scriptSource,
    "script-src-attr 'none'",
    styleSource,
    "img-src 'self' data: blob: https://*.supabase.co https://i.ytimg.com",
    "font-src 'self' data:",
    "media-src 'self' blob: https:",
    `connect-src 'self'${development ? " ws:" : ""} https://*.supabase.co wss://*.supabase.co https://www.youtube.com https://challenges.cloudflare.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io`,
    "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (!development && secureTransport) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

const NONCE_ROUTE_PREFIXES = ["/create", "/enter", "/invite", "/offline", "/recover", "/vault", "/vaults"];

/** Private, session-aware, and token-bearing pages keep per-request nonces. */
export function requiresNonce(pathname: string): boolean {
  return NONCE_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
