import type { ErrorEvent } from "@sentry/nextjs";

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const URL = /https?:\/\/[^\s"')]+/gi;
const LONG_SECRET = /\b[A-Za-z0-9_-]{24,}\b/g;

function scrub(value: string): string {
  return value.replace(EMAIL, "[email]").replace(URL, "[url]").replace(LONG_SECRET, "[redacted]");
}

/** Keep operational error shape while dropping Baul content and identifiers. */
export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  delete event.user;
  delete event.request;
  delete event.extra;
  if (event.message) event.message = scrub(event.message);
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrub(exception.value);
  }
  event.breadcrumbs = event.breadcrumbs?.map((breadcrumb) => ({
    category: breadcrumb.category,
    level: breadcrumb.level,
    message: breadcrumb.message ? scrub(breadcrumb.message) : undefined,
    timestamp: breadcrumb.timestamp,
    type: breadcrumb.type,
  }));
  return event;
}
