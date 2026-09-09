import "server-only";

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { memberRoleSchema, type ApiErrorCode } from "./domain";
import { supabaseAdmin } from "./supabase/admin";
import type { Member } from "./types";
import { logOperationalEvent } from "./observability";

export function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  const requestId = randomUUID();
  const code: ApiErrorCode =
    status === 400 ? "BAD_REQUEST"
      : status === 401 ? "AUTH_REQUIRED"
        : status === 403 ? "FORBIDDEN"
          : status === 404 ? "NOT_FOUND"
            : status === 409 ? "CONFLICT"
              : status === 429 ? (extra?.challengeRequired ? "CHALLENGE_REQUIRED" : "RATE_LIMITED")
                : "INTERNAL_ERROR";
  if (status >= 500) logOperationalEvent("api_5xx", { status, request_id: requestId });
  return NextResponse.json(
    { error, code, requestId, ...extra },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

/** Cookie-authenticated mutations must originate from this application. */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).origin === new URL(req.url).origin;
    } catch {
      return false;
    }
  }
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite) return fetchSite === "same-origin";
  return !req.headers.has("cookie");
}

/** Confirm an active member row belongs to the already-authorized vault. */
export async function loadMember(vaultId: string, memberId: string): Promise<Member | null> {
  const { data } = await supabaseAdmin()
    .from("members")
    .select("id, vault_id, display_name, name_changed_at, avatar_url, avatar_color, role, joined_at, revoked_at")
    .eq("id", memberId)
    .eq("vault_id", vaultId)
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) return null;
  const role = memberRoleSchema.safeParse(data.role);
  if (!role.success) {
    logOperationalEvent("database_contract_violation", { operation: "load_member" });
    return null;
  }
  return { ...data, role: role.data };
}

/** Split `bucket/vaultId/file` into a validated bucket and object key. */
export function splitStoragePath(path: string): { bucket: string; key: string } | null {
  const match = /^(avatars|photos|music|stickers)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(.+)$/.exec(path);
  const bucket = match?.[1];
  const vaultId = match?.[2];
  const objectName = match?.[3];
  if (!bucket || !vaultId || !objectName) return null;
  return { bucket, key: `${vaultId}/${objectName}` };
}

export function pathVaultId(path: string): string | null {
  return /^(?:avatars|photos|music|stickers)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//.exec(path)?.[1] ?? null;
}
