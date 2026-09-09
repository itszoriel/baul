import type { Tables } from "./database.types";

export type VaultType = "intimate" | "circle";
export type VaultPurpose = "romance" | "friends" | "family" | "team" | "other";
export type MemoryKind = "note" | "photo" | "letter" | "voice";

export interface SessionClaims {
  vaultId: string;
  memberId: string;
}

export type Vault = Omit<
  Pick<Tables<"vaults">, "id" | "name" | "vault_type" | "purpose" | "max_members" | "milestone_date" | "created_at">,
  "vault_type" | "purpose"
> & {
  vault_type: VaultType;
  purpose: VaultPurpose;
};

export type Member = Omit<
  Pick<
    Tables<"members">,
    | "id"
    | "vault_id"
    | "display_name"
    | "name_changed_at"
    | "avatar_url"
    | "avatar_color"
    | "role"
    | "joined_at"
    | "revoked_at"
  >,
  "role"
> & { role: "admin" | "member" };

export type Memory = Tables<"memories"> & {
  memory_capsule_payloads?: Pick<Tables<"memory_capsule_payloads">, "content"> | null;
};

export type Message = Tables<"messages">;

export type MessageReaction = Tables<"message_reactions">;

export type Song = Tables<"songs">;

export type Reaction = Tables<"reactions">;

export type VaultSticker = Tables<"vault_stickers">;

export type MemoryReply = Tables<"memory_replies">;

export interface Country {
  id: string;
  iso3: string;
  iso2: string;
  name: string;
  lat: number | null;
  lng: number | null;
}

export interface DivisionType {
  id: string;
  country_id: string;
  name: string;
  level: number;
}

export interface Division {
  id: string;
  country_id: string;
  type_id: string;
  parent_division_id: string | null;
  name: string;
  code: string | null;
  lat: number | null;
  lng: number | null;
}

/** Division-level aggregate — the globe's zoomed-in dots. Public, aggregate-only. */
export interface RegionStat {
  division_id: string;
  name: string;
  country_iso3: string;
  level: number;
  parent_division_id: string | null;
  lat: number | null;
  lng: number | null;
  vault_count: number;
  duo_count: number;
  circle_count: number;
  memory_count: number;
  song_count: number;
  updated_at: string;
}

/** Country-level aggregate; iso3 'WLD' is the world row (includes location opt-outs). */
export interface CountryStat {
  iso3: string;
  name: string;
  lat: number | null;
  lng: number | null;
  vault_count: number;
  duo_count: number;
  circle_count: number;
  memory_count: number;
  song_count: number;
  updated_at: string;
}
