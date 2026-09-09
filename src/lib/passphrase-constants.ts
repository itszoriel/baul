// Client-safe passphrase bounds. Kept out of keys.ts so client components can
// import the limits without pulling bcrypt / node:crypto into the browser.
export const PASSPHRASE_MIN = 10;
export const LEGACY_PASSPHRASE_MIN = 6;
export const PASSPHRASE_MAX = 128;
