import { describe, expect, it, vi } from "vitest";

const captureMessage = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureMessage }));

const { logOperationalEvent } = await import("@/lib/observability");
const { scrubSentryEvent } = await import("@/lib/sentry-privacy");

describe("logOperationalEvent", () => {
  it("sends alert context as tags that survive the privacy scrubber", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    logOperationalEvent("api_5xx", { status: 500, request_id: "req-1", email: "keeper@example.test" });
    const [, options] = captureMessage.mock.calls[0] as [string, { tags: Record<string, string> }];
    expect(options.tags).toEqual({ status: "500", request_id: "req-1" });

    const scrubbed = scrubSentryEvent({ type: undefined, message: "api_5xx", tags: options.tags, extra: { leaked: true } });
    expect(scrubbed.tags).toEqual({ status: "500", request_id: "req-1" });
    expect(scrubbed.extra).toBeUndefined();
  });
});
