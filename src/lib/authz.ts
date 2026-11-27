import "server-only";

import type { NextResponse } from "next/server";
import { jsonError, loadMember } from "./api";
import { requireVaultSession } from "./supabase/server";
import type { Member } from "./types";

const NOT_A_KEEPER = "No active keeper access to this baul.";

/**
 * The single authorization gate for service-role API routes. Those routes
 * bypass RLS, so every one of them must prove, in this order:
 *  1. the caller has a valid anonymous Auth session,
 *  2. that session holds a live (unrevoked) membership in `vaultId`,
 *  3. when `admin` is set, that membership has the admin role.
 * Routes must use this instead of composing the checks by hand.
 */
export async function requireMember(
  vaultId: string,
  options: { admin?: boolean; forbidden?: string } = {},
): Promise<{ ok: true; member: Member } | { ok: false; response: NextResponse }> {
  const session = await requireVaultSession(vaultId);
  if (!session.ok) return { ok: false, response: jsonError(session.status, session.error) };

  const member = await loadMember(session.claims.vaultId, session.claims.memberId);
  if (!member || member.vault_id !== vaultId) {
    return { ok: false, response: jsonError(403, NOT_A_KEEPER) };
  }
  if (options.admin && member.role !== "admin") {
    return { ok: false, response: jsonError(403, options.forbidden ?? "Only an admin keeper can do that.") };
  }
  return { ok: true, member };
}
