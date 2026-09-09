import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      version: process.env.VERCEL_GIT_COMMIT_SHA ?? "development",
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
