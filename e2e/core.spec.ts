import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// The reviewed baselines were captured on Windows. Linux font rasterization
// changes roughly 2% of pixels, so CI gets a narrow allowance while Windows
// remains pixel-exact.
const crossPlatformSnapshotTolerance = process.platform === "win32" ? undefined : 0.025;

for (const route of ["/", "/create", "/enter", "/recover", "/vaults", "/privacy", "/terms", "/acceptable-use", "/support"] as const) {
  test(`${route} has no serious accessibility violations`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("body")).toBeVisible();
    // Wait for the self-hosted fonts before evaluating contrast and layout.
    await page.evaluate(() => Promise.race([
      document.fonts.ready,
      new Promise((resolve) => window.setTimeout(resolve, 5_000)),
    ]));
    // Avoid scanning a transient frame. Entrance fades and autofocus color
    // transitions can start after load; axe blends ancestor opacity, so a
    // mid-fade input reads as e.g. #1d1915 on #17130f even though the settled
    // contrast passes. Wait for (1) every finite CSS/WAAPI animation and
    // (2) Framer Motion's JS-driven inline opacity fades, which
    // document.getAnimations() cannot see. Infinite animations are ignored.
    await page.evaluate(async () => {
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      for (let round = 0; round < 3; round += 1) {
        await nextFrame();
        const settling = document.getAnimations().filter((animation) => {
          const end = animation.effect?.getComputedTiming().endTime;
          return typeof end === "number" && Number.isFinite(end);
        });
        if (!settling.length) break;
        await Promise.race([
          Promise.all(settling.map((animation) => animation.finished.catch(() => undefined))),
          new Promise((resolve) => window.setTimeout(resolve, 2_000)),
        ]);
      }
      const fading = () => [...document.querySelectorAll<HTMLElement>("[style*='opacity']")]
        .some((element) => element.style.opacity !== "" && Number(element.style.opacity) < 1);
      const deadline = performance.now() + 3_000;
      while (fading() && performance.now() < deadline) await nextFrame();
    });
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
  await expect.poll(() => page.evaluate(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
  }))).toEqual({ pathname: "/enter", search: "", hash: "" });
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
  const [home, health, robots, sitemap, favicon, logo, socialImage] = await Promise.all([
    request.get("/"),
    request.get("/api/health"),
    request.get("/robots.txt"),
    request.get("/sitemap.xml"),
    request.get("/favicon.png"),
    request.get("/baul-logo.png"),
    request.get("/baul-social.png"),
  ]);
  expect(home.ok()).toBeTruthy();
  expect(health.ok()).toBeTruthy();
  for (const image of [favicon, logo, socialImage]) {
    expect(image.ok()).toBeTruthy();
    expect(image.headers()["content-type"]).toContain("image/png");
    expect((await image.body()).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  }
  const homeHtml = await home.text();
  expect(homeHtml).toContain("/favicon.png");
  expect(homeHtml).toContain("/baul-social.png");
  expect(homeHtml).toContain("Paul John E. Antigo");
  expect(homeHtml).toContain("itszoriel");
  expect(homeHtml).toContain("https://schema.org");
  const healthBody = await health.json();
  expect(healthBody).toMatchObject({ status: "ok" });
  expect(JSON.stringify(healthBody)).not.toContain("SUPABASE_SECRET_KEY");
  expect(await robots.text()).toContain("Disallow: /vault");
  expect(await sitemap.text()).toContain("http://127.0.0.1:3000/privacy");
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
    maxDiffPixelRatio: crossPlatformSnapshotTolerance,
  });
  await page.goto("/vaults");
  await expect(page.getByText("No Bauls on this browser yet.")).toBeVisible();
  await expect(page).toHaveScreenshot("vault-picker.png", {
    fullPage: true,
    animations: "disabled",
    maxDiffPixelRatio: crossPlatformSnapshotTolerance,
  });
});
