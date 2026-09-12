import { createClient } from "@supabase/supabase-js";
import Landing from "@/components/landing/Landing";
import { BRAND, DEVELOPER } from "@/lib/copy";
import { appUrl, isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/env";
import type { CountryStat, RegionStat } from "@/lib/types";

// The landing page reads ONLY the aggregate stats tables (spec §2.5) —
// never vault rows. Refresh the public shell soon after the scheduled database
// aggregate changes without turning the marketing page into a live feed.
export const revalidate = 60;

export default async function Home() {
  let regionStats: RegionStat[] = [];
  let countryStats: CountryStat[] = [];
  const configured = isSupabaseConfigured();

  if (configured) {
    const supabase = createClient(supabaseUrl(), supabaseAnonKey(), {
      auth: { persistSession: false },
    });
    const [regions, countries] = await Promise.all([
      supabase
        .from("region_stats")
        .select(
          "division_id, name, country_iso3, level, parent_division_id, lat, lng, vault_count, duo_count, circle_count, memory_count, song_count, updated_at",
        )
        .order("vault_count", { ascending: false })
        .limit(600),
      supabase
        .from("country_stats")
        .select("iso3, name, lat, lng, vault_count, duo_count, circle_count, memory_count, song_count, updated_at"),
    ]);
    regionStats = regions.data ?? [];
    countryStats = countries.data ?? [];
  }

  const origin = appUrl();
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${origin}/#website`,
    name: BRAND.name,
    alternateName: "Baul Project",
    url: origin,
    description: "A private, key-gated treasure chest for shared notes, photos, letters, and music.",
    image: `${origin}/baul-social.png`,
    creator: {
      "@type": "Person",
      "@id": `${origin}/#developer`,
      name: DEVELOPER.name,
      alternateName: DEVELOPER.handle,
      url: DEVELOPER.url,
      sameAs: [DEVELOPER.url],
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
      <Landing regionStats={regionStats} countryStats={countryStats} configured={configured} />
    </>
  );
}
