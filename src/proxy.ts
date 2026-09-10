import { NextRequest, NextResponse } from "next/server";
import { buildContentSecurityPolicy, requiresNonce } from "@/lib/csp";

export function proxy(request: NextRequest) {
  const development = process.env.NODE_ENV !== "production";
  const nonce = requiresNonce(request.nextUrl.pathname)
    ? Buffer.from(crypto.randomUUID()).toString("base64")
    : undefined;
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim();
  const secureTransport = forwardedProtocol
    ? forwardedProtocol === "https"
    : request.nextUrl.protocol === "https:";
  const policy = buildContentSecurityPolicy({
    nonce,
    development,
    secureTransport,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });

  const requestHeaders = new Headers(request.headers);
  if (nonce) requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
