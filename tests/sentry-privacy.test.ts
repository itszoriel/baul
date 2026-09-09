import { describe, expect, it } from "vitest";
import { scrubSentryEvent } from "@/lib/sentry-privacy";

describe("Sentry privacy scrubbing", () => {
  it("removes identity, request data, extras, URLs, email addresses, and long tokens", () => {
    const event = scrubSentryEvent({
      type: undefined,
      message: "Failed for keeper@example.com at https://baul.vercel.app/invite/secret-token-value-1234567890",
      user: { id: "keeper-id", email: "keeper@example.com" },
      request: { url: "https://baul.vercel.app/vault/private" },
      extra: { content: "private memory" },
      exception: {
        values: [{ value: "token abcdefghijklmnopqrstuvwxyz123456" }],
      },
      breadcrumbs: [{
        category: "navigation",
        message: "Opened https://baul.vercel.app/recover/token for keeper@example.com",
      }],
    });

    expect(event.user).toBeUndefined();
    expect(event.request).toBeUndefined();
    expect(event.extra).toBeUndefined();
    expect(event.message).toBe("Failed for [email] at [url]");
    expect(event.exception?.values?.[0]?.value).toBe("token [redacted]");
    expect(event.breadcrumbs?.[0]?.message).toBe("Opened [url] for [email]");
  });
});
