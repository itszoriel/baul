import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { vaultSummarySchema, type VaultSummary } from "@/lib/domain";
import { logOperationalEvent } from "@/lib/observability";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

function isMissingColumn(error: { code?: string } | null): boolean {
  return error?.code === "42703";
}

export async function GET() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "Not signed in.");

  const admin = supabaseAdmin();
  let membershipResult = await admin
    .from("members")
    .select("id, vault_id, display_name, role")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .order("joined_at", { ascending: true });
  if (isMissingColumn(membershipResult.error)) {
    logOperationalEvent("schema_compatibility_fallback", { operation: "list_memberships" });
    membershipResult = await admin
      .from("members")
      .select("id, vault_id, display_name, role")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: true });
  }
  const { data: memberships, error } = membershipResult;
  if (error) {
    logOperationalEvent("database_operation_failed", { operation: "list_memberships", error_code: error.code });
    return jsonError(500, "Could not load your bauls.");
  }
  if (!memberships?.length) return NextResponse.json({ vaults: [] });

  const vaultIds = memberships.map((member) => member.vault_id);
  const [currentVaultResult, currentCountResult] = await Promise.all([
    admin
      .from("vaults")
      .select("id, name, vault_type, purpose, milestone_date, created_at")
      .in("id", vaultIds),
    admin.from("members").select("vault_id").in("vault_id", vaultIds).is("revoked_at", null),
  ]);

  let vaults = currentVaultResult.data;
  let vaultError = currentVaultResult.error;
  if (isMissingColumn(vaultError)) {
    logOperationalEvent("schema_compatibility_fallback", { operation: "list_vaults" });
    const legacyVaultResult = await admin
      .from("vaults")
      .select("id, name, vault_type, purpose, created_at")
      .in("id", vaultIds);
    vaultError = legacyVaultResult.error;
    vaults = legacyVaultResult.data?.map((vault) => ({ ...vault, milestone_date: null })) ?? null;
  }

  let memberRows = currentCountResult.data;
  let countError = currentCountResult.error;
  if (isMissingColumn(countError)) {
    logOperationalEvent("schema_compatibility_fallback", { operation: "count_memberships" });
    const legacyCountResult = await admin.from("members").select("vault_id").in("vault_id", vaultIds);
    memberRows = legacyCountResult.data;
    countError = legacyCountResult.error;
  }

  if (vaultError || countError) {
    const failed = vaultError ?? countError;
    logOperationalEvent("database_operation_failed", {
      operation: vaultError ? "list_vaults" : "count_memberships",
      error_code: failed?.code ?? "unknown",
    });
    return jsonError(500, "Could not load your bauls.");
  }

  const countByVault = new Map<string, number>();
  for (const row of memberRows ?? []) countByVault.set(row.vault_id, (countByVault.get(row.vault_id) ?? 0) + 1);
  const vaultById = new Map((vaults ?? []).map((vault) => [vault.id, vault]));

  const summaries: VaultSummary[] = memberships.flatMap((membership) => {
    const vault = vaultById.get(membership.vault_id);
    if (!vault) return [];
    const parsed = vaultSummarySchema.safeParse({
      id: vault.id,
      name: vault.name,
      vaultType: vault.vault_type,
      purpose: vault.purpose,
      memberId: membership.id,
      displayName: membership.display_name,
      role: membership.role,
      memberCount: countByVault.get(vault.id) ?? 0,
      milestoneDate: vault.milestone_date,
      createdAt: vault.created_at,
    });
    if (!parsed.success) {
      logOperationalEvent("database_contract_violation", { operation: "list_vaults" });
      return [];
    }
    return [parsed.data];
  });

  return NextResponse.json({ vaults: summaries }, { headers: { "Cache-Control": "private, no-store" } });
}
