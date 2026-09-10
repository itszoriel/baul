import { defineConfig, devices } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const fullStack = process.env.E2E_FULL === "1";
const testAppUrl = "http://localhost:3000";

function localSupabaseEnvironment(): Record<string, string> {
  // Playwright loads this config again inside every worker process. Only the
  // runner that starts the web server should call the Supabase CLI; parallel
  // CLI calls race while updating its shared Windows telemetry file.
  if (!fullStack || process.env.TEST_WORKER_INDEX !== undefined) return {};

  const cliPath = join(process.cwd(), "node_modules", "supabase", "dist", "supabase.js");
  const output = execFileSync(process.execPath, [cliPath, "status", "-o", "env"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const values = Object.fromEntries(
    [...output.matchAll(/^([A-Z0-9_]+)="([^"]*)"$/gm)].map((match) => [match[1], match[2]]),
  );
  const apiUrl = values.API_URL;
  const publishableKey = values.PUBLISHABLE_KEY ?? values.ANON_KEY;
  const secretKey = values.SECRET_KEY ?? values.SERVICE_ROLE_KEY;

  if (!apiUrl || !publishableKey || !secretKey) {
    throw new Error("Full E2E requires a running local Supabase stack.");
  }
  const hostname = new URL(apiUrl).hostname;
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(`Refusing to run full E2E against non-local Supabase host: ${hostname}`);
  }

  return {
    NEXT_PUBLIC_SUPABASE_URL: apiUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    SUPABASE_SECRET_KEY: secretKey,
    APP_SECRET: "e2e-only-app-secret-with-at-least-32-characters",
    NEXT_PUBLIC_APP_URL: testAppUrl,
    CRON_SECRET: "e2e-only-cron-secret-with-at-least-32-characters",
    CLEANUP_SECRET: "e2e-only-cleanup-secret-with-at-least-32-characters",
    RESEND_API_KEY: "",
    TURNSTILE_SECRET_KEY: "",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
    SENTRY_DSN: "",
    NEXT_PUBLIC_SENTRY_DSN: "",
    SENTRY_AUTH_TOKEN: "",
  };
}

const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // The local Supabase/PostgREST pool is intentionally small. Keeping full
  // stack runs below that capacity prevents infrastructure-only 502s while
  // preserving parallel coverage across all browser profiles.
  workers: fullStack ? 4 : undefined,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  // Keep one reviewed baseline per browser profile so local and CI runs use
  // the same artifact instead of silently creating OS-specific snapshots.
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}-{projectName}{ext}",
  use: {
    baseURL: testAppUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    // Exercise the same optimized rendering and CSP behavior shipped by
    // Vercel. Development mode intentionally enables unsafe-eval for HMR.
    command: "npm run build && npm run start -- --hostname 127.0.0.1",
    url: testAppUrl,
    env: {
      ...inheritedEnvironment,
      ...localSupabaseEnvironment(),
    },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
