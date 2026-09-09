import { supabaseAdmin } from "./supabase/admin";

/**
 * Vault location resolution against the administrative-divisions reference
 * data (countries → administrative_divisions, any depth per country).
 *
 * The wizard sends a user-CHOSEN country and, when the country has seeded
 * divisions, an optional finer division. Nothing is ever inferred from IP.
 * Both may be null — the explicit "somewhere on Earth" opt-out (spec §2.5).
 */

export interface VaultLocation {
  countryId: string | null;
  divisionId: string | null;
  /** Coarse display point for the globe ping; null when opted out or uncharted. */
  ping: { lat: number; lng: number; name: string } | null;
}

export async function resolveVaultLocation(
  countryId: string | null,
  divisionId: string | null,
): Promise<{ ok: true; location: VaultLocation } | { ok: false; error: string }> {
  if (!countryId) {
    // Opt-out. A division without a country is rejected, not guessed.
    if (divisionId) return { ok: false, error: "A location needs its country." };
    return { ok: true, location: { countryId: null, divisionId: null, ping: null } };
  }

  const db = supabaseAdmin();
  const { data: country } = await db
    .from("countries")
    .select("id, name, lat, lng")
    .eq("id", countryId)
    .maybeSingle();
  if (!country) return { ok: false, error: "That country isn't on our globe." };

  let place: { name: string; lat: number | null; lng: number | null } = country;

  if (divisionId) {
    const { data: division } = await db
      .from("administrative_divisions")
      .select("id, country_id, name, lat, lng, is_active")
      .eq("id", divisionId)
      .maybeSingle();
    if (!division || !division.is_active) return { ok: false, error: "That place isn't on our globe." };
    if (division.country_id !== countryId) return { ok: false, error: "That place isn't in that country." };
    // Division centroid may be uncharted — fall back to the country's point.
    place = division.lat != null && division.lng != null ? division : { ...division, lat: country.lat, lng: country.lng };
  }

  return {
    ok: true,
    location: {
      countryId,
      divisionId: divisionId ?? null,
      ping: place.lat != null && place.lng != null ? { lat: place.lat, lng: place.lng, name: place.name } : null,
    },
  };
}
