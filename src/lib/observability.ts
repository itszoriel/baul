import "server-only";

import * as Sentry from "@sentry/nextjs";

const FORBIDDEN_FIELD = /(key|token|email|content|body|message|url|path|secret|passphrase)/i;
const ALERT_EVENTS = new Set([
  "api_5xx",
  "database_contract_violation",
  "email_delivery_failed",
  "song_upload_reservation_failed",
  "song_upload_completion_failed",
]);

/** Structured operational telemetry with a defensive sensitive-field filter. */
export function logOperationalEvent(event: string, fields: Record<string, string | number | boolean | null> = {}) {
  const safeFields = Object.fromEntries(Object.entries(fields).filter(([name]) => !FORBIDDEN_FIELD.test(name)));
  console.info(JSON.stringify({ event, at: new Date().toISOString(), ...safeFields }));
  if (ALERT_EVENTS.has(event)) {
    Sentry.captureMessage(event, { level: "error", extra: safeFields });
  }
}
