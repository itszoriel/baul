import { expect, test, type Page, type Route } from "@playwright/test";
import { randomBytes } from "node:crypto";

const fullStack = process.env.E2E_FULL === "1";
const youtubeApiUrl = "https://www.youtube.com/iframe_api";
const videoId = "dQw4w9WgXcQ";

function testClientIp() {
  const hex = randomBytes(6).toString("hex");
  return `2001:db8:${hex.slice(0, 4)}:${hex.slice(4, 8)}:${hex.slice(8, 12)}::1`;
}

const youtubeStub = `
window.YT = {
  Player: function (mount, options) {
    var iframe = document.createElement('iframe');
    iframe.title = 'YouTube video player';
    iframe.setAttribute('data-testid', 'youtube-iframe');
    mount.replaceWith(iframe);
    this.playVideo = function () {
      setTimeout(function () {
        if (window.__BAUL_BLOCK_YOUTUBE__) options.events.onAutoplayBlocked();
        else options.events.onStateChange({ data: 1 });
      }, 0);
    };
    this.pauseVideo = function () {
      setTimeout(function () { options.events.onStateChange({ data: 2 }); }, 0);
    };
    this.loadVideoById = this.playVideo;
    this.cueVideoById = function () {};
    this.destroy = function () { iframe.remove(); };
    setTimeout(options.events.onReady, 120);
  }
};
window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady();
`;

async function createAndJoin(page: Page) {
  await page.context().setExtraHTTPHeaders({
    "x-forwarded-for": testClientIp(),
  });
  await page.goto("/");
  const response = await page.evaluate(async (data) => {
    const result = await fetch("/api/vaults", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return { ok: result.ok, body: await result.text() };
  }, {
      name: "Music test baul",
      maxMembers: 3,
      purpose: "friends",
      recoveryEmail: null,
      milestoneDate: null,
      countryId: null,
      divisionId: null,
  });
  expect(response.ok, response.body).toBeTruthy();
  const created = JSON.parse(response.body) as { key: string; vaultId: string };

  await page.goto("/enter");
  const keyInput = page.getByLabel("Your baul key");
  const openButton = page.getByRole("button", { name: "Open the baul" });
  await expect(async () => {
    await keyInput.fill("");
    await keyInput.fill(created.key);
    await expect(openButton).toBeEnabled({ timeout: 500 });
  }).toPass({ timeout: 5_000 });
  await openButton.click();
  await page.getByLabel("Display name").fill("Music Keeper");
  await page.getByPlaceholder(/Your passphrase/).fill("music keeper phrase");
  await page.getByPlaceholder("Type it again").fill("music keeper phrase");
  await page.getByRole("button", { name: "Step inside" }).click();
  await expect(page).toHaveURL(new RegExp(`/vault/${created.vaultId}$`));
}

async function addYouTubeSong(page: Page, title: string) {
  await page.getByRole("button", { name: "Open the playlist" }).click();
  const playlist = page.getByRole("region", { name: "Soundtrack playlist" });
  await playlist.getByRole("button", { name: "Add a song" }).click();
  await page.getByLabel("Link to the song").fill(`https://www.youtube.com/watch?v=${videoId}`);
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Add song" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(songButton(playlist, title)).toBeVisible();
}

function songButton(playlist: ReturnType<Page["getByRole"]>, title: string) {
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return playlist.getByRole("button", {
    name: new RegExp(`^${escapedTitle} added(?: by .+)?$`),
  });
}

async function fulfillYouTube(route: Route) {
  await route.fulfill({
    status: 200,
    contentType: "application/javascript; charset=utf-8",
    body: youtubeStub,
  });
}

test.describe("shared YouTube soundtrack", () => {
  test.skip(!fullStack, "Requires E2E_FULL=1 and a disposable local Supabase stack.");

  test("shows truthful playback, handles blocking, and keeps a compliant player viewport", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.route(youtubeApiUrl, fulfillYouTube);
    await createAndJoin(page);
    await addYouTubeSong(page, "A deterministic YouTube song");

    await expect(page.getByRole("region", { name: /YouTube player for/i })).toHaveCount(0);
    await songButton(
      page.getByRole("region", { name: "Soundtrack playlist" }),
      "A deterministic YouTube song",
    ).click();
    await expect(page.getByText("Opening this song…")).toBeVisible();
    await expect(page.getByTitle("YouTube video player")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();

    const box = await page.getByTitle("YouTube video player").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(200);
    expect(box!.height).toBeGreaterThanOrEqual(200);

    await page.getByRole("button", { name: "Minimize the YouTube player while it keeps playing" }).click();
    await expect.poll(async () => {
      const compactBox = await page.getByTitle("YouTube video player").boundingBox();
      return compactBox ? Math.min(compactBox.width, compactBox.height) : 0;
    }).toBeGreaterThanOrEqual(200);
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Restore the YouTube player" }).click();

    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(page.getByRole("region", { name: /YouTube player for/i })).toBeHidden();
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();

    await page.evaluate(() => {
      (window as Window & { __BAUL_BLOCK_YOUTUBE__?: boolean }).__BAUL_BLOCK_YOUTUBE__ = true;
    });
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.getByText(/browser paused this song/i)).toBeVisible();

    await page.evaluate(() => {
      (window as Window & { __BAUL_BLOCK_YOUTUBE__?: boolean }).__BAUL_BLOCK_YOUTUBE__ = false;
    });
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Open the playlist" }).click();
    await expect(page.getByRole("region", { name: /YouTube player for/i })).toBeHidden();
    expect(consoleErrors.filter((message) => /content security policy|iframe_api/i.test(message))).toEqual([]);
  });

  test("replaces a failed API load with retry actions instead of an empty box", async ({ page }) => {
    let shouldFail = true;
    await page.route(youtubeApiUrl, async (route) => {
      if (shouldFail) await route.abort("failed");
      else await fulfillYouTube(route);
    });
    await createAndJoin(page);
    await addYouTubeSong(page, "A retryable YouTube song");
    await songButton(
      page.getByRole("region", { name: "Soundtrack playlist" }),
      "A retryable YouTube song",
    ).click();

    await expect(page.getByText("The song stayed closed.")).toBeVisible();
    await expect(page.getByRole("link", { name: /Watch on YouTube/ })).toHaveAttribute(
      "href",
      `https://www.youtube.com/watch?v=${videoId}`,
    );

    shouldFail = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByTitle("YouTube video player")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  });
});

test.describe("direct MP3 uploads", () => {
  test.skip(!fullStack, "Requires E2E_FULL=1 and a disposable local Supabase stack.");

  test("uploads a file larger than Vercel's request limit directly to private storage", async ({ page }) => {
    await createAndJoin(page);
    await page.getByRole("button", { name: "Open the playlist" }).click();
    await page.getByRole("region", { name: "Soundtrack playlist" })
      .getByRole("button", { name: "Add a song" })
      .click();
    await page.getByRole("tab", { name: "Upload an MP3" }).click();

    const mp3 = Buffer.alloc(5 * 1024 * 1024);
    mp3.set([0x49, 0x44, 0x33], 0);
    await page.getByLabel("MP3 file (max 15MB)").setInputFiles({
      name: "large-test.mp3",
      mimeType: "audio/mpeg",
      buffer: mp3,
    });
    await page.getByLabel("Title").fill("A large direct upload");
    await page.getByRole("button", { name: "Add song" }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(songButton(
      page.getByRole("region", { name: "Soundtrack playlist" }),
      "A large direct upload",
    )).toBeVisible();
  });
});
