import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const fullStack = process.env.E2E_FULL === "1";

async function createAndJoin(page: Page, name: string, keeperName: string, phrase: string) {
  const response = await page.request.post("/api/vaults", {
    data: {
      name,
      maxMembers: 3,
      purpose: "friends",
      recoveryEmail: null,
      milestoneDate: null,
      countryId: null,
      divisionId: null,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const created = await response.json() as { key: string; vaultId: string };

  await page.goto("/enter");
  await page.getByLabel("Your baul key").fill(created.key);
  await page.getByRole("button", { name: "Open the baul" }).click();
  await page.getByLabel("Display name").fill(keeperName);
  await page.getByPlaceholder(/Your passphrase/).fill(phrase);
  await page.getByPlaceholder("Type it again").fill(phrase);
  await page.getByRole("button", { name: "Step inside" }).click();
  await expect(page).toHaveURL(new RegExp(`/vault/${created.vaultId}$`));
  return created;
}

async function jsonMutation<T>(page: Page, path: string, body: unknown): Promise<{ status: number; body: T }> {
  return page.evaluate(async ({ path: target, body: payload }) => {
    const response = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { status: response.status, body: await response.json() as T };
  }, { path, body });
}

async function enterInvite(context: BrowserContext, inviteUrl: string, name: string, phrase: string) {
  const page = await context.newPage();
  await page.goto(inviteUrl);
  await page.getByLabel("Keeper name").fill(name);
  await page.getByLabel("Personal keeper phrase").fill(phrase);
  await page.getByLabel("Repeat keeper phrase").fill(phrase);
  await page.getByRole("button", { name: "Become a keeper" }).click();
  await expect(page).toHaveURL(/\/vault\/[0-9a-f-]+$/);
  return page;
}

test.describe("live membership security flow", () => {
  test.skip(!fullStack, "Requires E2E_FULL=1 and a disposable local Supabase stack.");

  test("multi-Baul membership, one-time invites, capsules, reclaim, and old-device denial", async ({ browser, browserName }) => {
    test.skip(browserName !== "chromium", "Run the stateful security scenario once; core routes still run in WebKit mobile.");
    const ownerContext = await browser.newContext();
    const owner = await ownerContext.newPage();
    const ownerPhrase = "keeper phrase alpha";
    const first = await createAndJoin(owner, "Security flow one", "Owner Alpha", ownerPhrase);

    const second = await createAndJoin(owner, "Security flow two", "Owner Beta", "keeper phrase beta");
    await owner.goto("/vaults");
    await expect(owner.getByText("Security flow one")).toBeVisible();
    await expect(owner.getByText("Security flow two")).toBeVisible();

    const invite = await jsonMutation<{ inviteId: string; inviteUrl: string }>(
      owner,
      `/api/vaults/${first.vaultId}/invites`,
      { expiresInDays: 7 },
    );
    expect(invite.status).toBe(200);
    expect(invite.body.inviteUrl).not.toContain(first.key);

    const guestContext = await browser.newContext();
    const guest = await enterInvite(guestContext, invite.body.inviteUrl, "Guest One", "keeper phrase guest");

    const replayContext = await browser.newContext();
    const replay = await replayContext.newPage();
    await replay.goto(invite.body.inviteUrl);
    await replay.getByLabel("Keeper name").fill("Replay Keeper");
    await replay.getByLabel("Personal keeper phrase").fill("keeper phrase replay");
    await replay.getByLabel("Repeat keeper phrase").fill("keeper phrase replay");
    await replay.getByRole("button", { name: "Become a keeper" }).click();
    await expect(replay.getByText(/already used|invalid|expired/i)).toBeVisible();

    const future = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    const capsule = await jsonMutation<{ memory?: { id: string } }>(owner, "/api/memories", {
      vaultId: first.vaultId,
      kind: "letter",
      content: "future payload must stay private",
      unlockAt: future,
      songId: null,
    });
    expect(capsule.status).toBe(200);
    await guest.goto(`/vault/${first.vaultId}`);
    await expect(guest.getByText("future payload must stay private")).toHaveCount(0);

    const reclaimContext = await browser.newContext();
    const reclaim = await reclaimContext.newPage();
    await reclaim.goto("/enter");
    await reclaim.getByLabel("Your baul key").fill(first.key);
    await reclaim.getByRole("button", { name: "Open the baul" }).click();
    await reclaim.getByRole("button", { name: "I've been here" }).click();
    await reclaim.getByLabel("Your username here").fill("Owner Alpha");
    await reclaim.getByLabel("Your passphrase").fill(ownerPhrase);
    await reclaim.getByRole("button", { name: "Reclaim my keeper" }).click();
    await expect(reclaim).toHaveURL(new RegExp(`/vault/${first.vaultId}$`));

    const oldDeviceVaults = await owner.evaluate(async () => {
      const response = await fetch("/api/me/vaults", { cache: "no-store" });
      return response.json() as Promise<{ vaults: Array<{ id: string }> }>;
    });
    expect(oldDeviceVaults.vaults.some((vault) => vault.id === first.vaultId)).toBeFalsy();
    expect(oldDeviceVaults.vaults.some((vault) => vault.id === second.vaultId)).toBeTruthy();

    await Promise.all([ownerContext.close(), guestContext.close(), replayContext.close(), reclaimContext.close()]);
  });
});
