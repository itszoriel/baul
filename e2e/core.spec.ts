import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const route of ["/", "/create", "/enter", "/recover", "/vaults", "/privacy", "/terms", "/acceptable-use", "/support"] as const) {
  test(`${route} has no serious accessibility violations`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("body")).toBeVisible();
    // Wait for the self-hosted fonts before evaluating contrast and layout.
    await page.evaluate(() => Promise.race([
      document.fonts.ready,
      new Promise((resolve) => window.setTimeout(resolve, 5_000)),
    ]));
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
  });
}

test("public app shell uses the static policy while private routes keep nonces", async ({ page }) => {
  const response = await page.goto("/");
  const policy = response?.headers()["content-security-policy"] ?? "";
  const scriptDirective = policy.split("; ").find((directive) => directive.startsWith("script-src ")) ?? "";

  expect(scriptDirective).toBe("script-src 'self' 'unsafe-inline'");
  expect(scriptDirective).not.toContain("'unsafe-eval'");

  const privateResponse = await page.goto("/enter");
  const privateScriptDirective = (privateResponse?.headers()["content-security-policy"] ?? "")
    .split("; ")
    .find((directive) => directive.startsWith("script-src ")) ?? "";
  expect(privateScriptDirective).toContain("'nonce-");
  expect(privateScriptDirective).toContain("'strict-dynamic'");
  expect(privateScriptDirective).not.toContain("'unsafe-inline'");
});

test("legacy query keys are removed from browser history immediately", async ({ page }) => {
  await page.goto("/enter?key=VLT-abcd-EFGH-2345-6789");
  // WebKit's Playwright navigation cache may retain the pre-replaceState URL;
  // the document location is the privacy boundary that controls referrers.
  await expect.poll(() => page.evaluate(() => window.location.href)).toBe("http://127.0.0.1:3000/enter");
});

test("landing content and primary paths remain visible when client bundles fail", async ({ page }) => {
  await page.route("**/_next/static/**/*.js", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create a baul" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "I have a key" }).first()).toBeVisible();
  await expect(page.getByText("The chest at the foot of the bed, made digital.")).toBeVisible();
});

test("public metadata and shallow health endpoints expose no private state", async ({ request }) => {
  const [health, robots, sitemap] = await Promise.all([
    request.get("/api/health"),
    request.get("/robots.txt"),
    request.get("/sitemap.xml"),
  ]);
  expect(health.ok()).toBeTruthy();
  const healthBody = await health.json();
  expect(healthBody).toMatchObject({ status: "ok" });
  expect(JSON.stringify(healthBody)).not.toContain("SUPABASE_SECRET_KEY");
  expect(await robots.text()).toContain("Disallow: /vault");
  expect(await sitemap.text()).toContain("https://baul.vercel.app/privacy");
});

test("landing and picker visual baselines", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "webkit", "Reviewed pixel baselines use Chromium rendering.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.evaluate(() => Promise.race([
    document.fonts.ready,
    new Promise((resolve) => window.setTimeout(resolve, 5_000)),
  ]));
  // WebGL rasterization differs by GPU/driver; mask only the canvas while
  // retaining the complete hero typography, controls, overlays, and layout.
  await expect(page).toHaveScreenshot("landing.png", {
    fullPage: false,
    animations: "allow",
    mask: [page.locator("canvas"), page.getByTestId("global-totals")],
    maskColor: "#17130f",
  });
  await page.goto("/vaults");
  await expect(page.getByText("No Bauls on this browser yet.")).toBeVisible();
  await expect(page).toHaveScreenshot("vault-picker.png", { fullPage: true, animations: "disabled" });
});
