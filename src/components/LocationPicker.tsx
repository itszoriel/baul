"use client";

import { MoonStar } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { COPY } from "@/lib/copy";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Country, Division, DivisionType } from "@/lib/types";
import { cn } from "./ui";

/**
 * The wizard's location step (spec §2.1 step 4). Reads the public
 * administrative-divisions reference data: a searchable country picker, then
 * cascading division pickers for as deep as that country's data goes (PH:
 * region → province; US: state; most countries: country only). Depth is
 * data-driven — no hierarchy shape is assumed here.
 */

export interface LocationValue {
  countryId: string | null;
  divisionId: string | null;
}

function flagEmoji(iso2: string): string {
  return String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)));
}

export function LocationPicker({
  value,
  onChange,
}: {
  value: LocationValue;
  onChange: (v: LocationValue) => void;
}) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [types, setTypes] = useState<DivisionType[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState<Country | null>(null);
  // One entry per revealed depth: the options at that depth + the chosen one.
  const [levels, setLevels] = useState<Array<{ options: Division[]; chosen: Division | null }>>([]);
  const hidden = value.countryId === null && country === null;
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabaseBrowser()
      .from("countries")
      .select("id, iso3, iso2, name, lat, lng")
      .order("name")
      .then(({ data }) => setCountries((data as Country[]) ?? []));
  }, []);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter((c) => c.name.toLowerCase().includes(q) || c.iso3.toLowerCase() === q);
  }, [countries, query]);

  async function fetchChildren(countryId: string, parentId: string | null): Promise<Division[]> {
    let req = supabaseBrowser()
      .from("administrative_divisions")
      .select("id, country_id, type_id, parent_division_id, name, code, lat, lng")
      .eq("country_id", countryId)
      .eq("is_active", true)
      .order("name");
    req = parentId ? req.eq("parent_division_id", parentId) : req.is("parent_division_id", null);
    const { data } = await req;
    return (data as Division[]) ?? [];
  }

  async function pickCountry(c: Country) {
    setCountry(c);
    setQuery(c.name);
    setOpen(false);
    onChange({ countryId: c.id, divisionId: null });
    const [{ data: typeRows }, roots] = await Promise.all([
      supabaseBrowser().from("division_types").select("id, country_id, name, level").eq("country_id", c.id),
      fetchChildren(c.id, null),
    ]);
    setTypes((typeRows as DivisionType[]) ?? []);
    setLevels(roots.length > 0 ? [{ options: roots, chosen: null }] : []);
  }

  async function pickDivision(depth: number, division: Division | null) {
    const kept = levels.slice(0, depth + 1).map((l, i) => (i === depth ? { ...l, chosen: division } : l));
    if (!division) {
      setLevels(kept);
      onChange({ countryId: country!.id, divisionId: kept.findLast((l) => l.chosen)?.chosen?.id ?? null });
      return;
    }
    onChange({ countryId: country!.id, divisionId: division.id });
    const children = await fetchChildren(division.country_id, division.id);
    setLevels(children.length > 0 ? [...kept, { options: children, chosen: null }] : kept);
  }

  function hideLocation() {
    setCountry(null);
    setQuery("");
    setLevels([]);
    onChange({ countryId: null, divisionId: null });
  }

  const typeName = (typeId: string) => types.find((t) => t.id === typeId)?.name ?? "Area";

  return (
    <div className="space-y-4 text-left">
      <div ref={boxRef} className="relative">
        <label className="block">
          <span className="mb-1.5 block text-sm text-dim">Country</span>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              if (country) {
                setCountry(null);
                setLevels([]);
                onChange({ countryId: null, divisionId: null });
              }
            }}
            onFocus={() => setOpen(true)}
            placeholder="Start typing a country…"
            className="min-h-12 w-full rounded-xl border border-brass/15 bg-[#201912] px-4 py-3 text-starlight placeholder:text-dim/60 focus:border-brass/60 focus:outline-none"
            aria-expanded={open}
            role="combobox"
            aria-controls="country-options"
          />
        </label>
        {open && filtered.length > 0 && (
          <ul
            id="country-options"
            role="listbox"
            className="glass absolute z-30 mt-2 max-h-56 w-full overflow-y-auto rounded-xl bg-night-2 py-1 shadow-2xl shadow-black/50"
          >
            {filtered.slice(0, 60).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => pickCountry(c)}
                  className={cn(
                    "flex min-h-11 w-full cursor-pointer items-center gap-2.5 px-4 py-2 text-left text-sm text-starlight hover:bg-white/10",
                    country?.id === c.id && "bg-white/5",
                  )}
                >
                  <span aria-hidden>{flagEmoji(c.iso2)}</span>
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {levels.map((level, depth) => (
        <label key={depth} className="block">
          <span className="mb-1.5 block text-sm text-dim">
            {typeName(level.options[0]?.type_id ?? "")} <span className="text-dim/60">(optional)</span>
          </span>
          <select
            value={level.chosen?.id ?? ""}
            onChange={(e) => pickDivision(depth, level.options.find((d) => d.id === e.target.value) ?? null)}
            className="min-h-12 w-full cursor-pointer rounded-xl border border-brass/15 bg-[#201912] px-4 py-3 text-starlight focus:border-brass/60 focus:outline-none [&>option]:bg-night-2"
          >
            <option value="">Anywhere in {depth === 0 ? country?.name : levels[depth - 1]?.chosen?.name}</option>
            {level.options.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      ))}

      <button
        type="button"
        onClick={hideLocation}
        className={cn(
          "min-h-12 w-full cursor-pointer rounded-xl border px-4 py-3 text-left text-sm transition-colors",
          hidden
            ? "border-brass/60 bg-brass/10 text-starlight"
            : "border-white/10 text-dim hover:border-white/25 hover:text-starlight",
        )}
        aria-pressed={hidden}
      >
        <span className="flex items-center gap-2">
          <MoonStar className="size-4 shrink-0" /> {COPY.locationHidden}
        </span>
      </button>

      <p className="text-xs text-dim/80">
        {hidden ? COPY.locationHiddenReassure : COPY.locationSharedReassure}
      </p>
    </div>
  );
}
