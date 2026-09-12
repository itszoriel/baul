import type { VaultType } from "./types";

/**
 * All human-visible strings say "baul"; code says vault (spec §0).
 * Copy tone branches by vault type: intimate = tender, circle = casual.
 */

export const BRAND = {
  name: "Baul",
  tagline: "Somewhere on this globe, someone just opened their baul.",
  pronunciation: "Baul (bah-ool) — a Filipino treasure chest.",
};

export const DEVELOPER = {
  name: "Paul John E. Antigo",
  handle: "itszoriel",
  url: "https://github.com/itszoriel",
} as const;

export function memoryAddedLine(vaultType: VaultType, name: string): string {
  return vaultType === "intimate" ? "your person added a memory" : `${name} added to the board.`;
}

export const COPY = {
  createCta: "Create a baul",
  enterCta: "I have a key",
  enterTitle: "Enter your baul",
  keyRevealTitle: "Here's the only key to your baul — guard it well.",
  sealedWarning: "Without an email, if you lose this key, your baul is gone forever.",
  guardedLabel: "Guarded baul",
  guardedDesc: "We keep a recovery email. Lose the key and we can forge you a new one.",
  sealedLabel: "Sealed baul",
  sealedDesc: "No email, no recovery. If the key is lost, the baul stays shut forever.",
  globePrivacy: "Locations are approximate and anonymous.",
  locationTitle: "Where in the world is this baul?",
  locationSharedReassure:
    "Your country total may appear after the next delayed refresh, even at one Baul. The dot is a country-level approximation — never your exact location or your Baul.",
  locationHiddenReassure:
    "No country will be shown. This Baul will count only toward the location-free worldwide total.",
  locationHidden: "Somewhere on Earth (don't show my region)",
  recoverExplainer:
    "We never store the plaintext permanent key. Recovery sends a 30-minute confirmation link; the current key changes only after you confirm it.",
};

export function vaultTypeLabel(vaultType: VaultType): string {
  return vaultType === "intimate" ? "a baul for two" : "Circle Baul";
}
