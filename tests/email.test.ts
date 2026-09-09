import { afterEach, describe, expect, it, vi } from "vitest";
import { sendActionEmail } from "@/lib/email";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("email failure behavior", () => {
  it("reports unavailable delivery without throwing or mutating key state", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(sendActionEmail({
      to: "keeper@example.test",
      vaultName: "Test Baul",
      actionUrl: "https://example.test/recover/confirm",
      kind: "recovery",
    })).resolves.toBe(false);
  });

  it("rejects recipients outside the production beta allowlist before delivery", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "not-used-because-recipient-is-denied");
    vi.stubEnv("EMAIL_RECIPIENT_ALLOWLIST", "pauljohn.antigo@gmail.com");
    await expect(sendActionEmail({
      to: "another@example.test",
      vaultName: "Test Baul",
      actionUrl: "https://example.test/invite/token",
      kind: "invite",
    })).resolves.toBe(false);
  });
});
