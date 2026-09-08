import { test, expect, type Page } from "@playwright/test";
import type { Floor } from "../../src/lib/ai/types";

const floors: Floor[] = [
  ...Array.from({ length: 30 }, (_, i) => ({ id: `floor-${i + 1}`, ordinal: i + 1, kind: "floor" as const })),
  { id: "roof", ordinal: 1_000_000, kind: "roof" as const },
  { id: "basement", ordinal: -1000, kind: "basement" as const },
].map((floor) => ({ ...floor, status: "ready", themePrompt: `Original user prompt for ${floor.id}. <b>This is literal text.</b>`,
  displayName: `Room ${floor.id}`, spec: null, failureReason: null, meta: {}, width: 1774, height: 887, isReference: false, createdAt: "2026-09-07T19:00:00Z" }));
const sponsored = { enabled: true, available: true, remainingToday: 4, reason: null, resetAt: "2026-09-08T07:00:00Z" };
const suggestions = Array.from({ length: 12 }, (_, i) => ({ label: `Idea ${i + 1}`, prompt: `A curious room number ${i + 1} filled with suspicious librarians, dusty books and impossible machines. Everyone argues about the moon while a cat quietly changes the evidence.` }));

async function mockBuilding(page: Page, selected = floors, delay = 0) {
  await page.route("**/api/floors", async (route) => {
    if (route.request().method() !== "GET") return route.fulfill({ status: 503, json: { error: "Test mode: no paid calls." } });
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    await route.fulfill({ json: { floors: selected, sponsored, serverKeys: true, local: false } });
  });
  await page.route("**/api/floors/*/image", (route) => route.fulfill({ path: "public/middle-floor.png", contentType: "image/png" }));
  await page.route("**/api/suggestions", (route) => route.fulfill({ json: { batchId: "batch-1", suggestions } }));
  await page.route("**/api/sponsorship", (route) => route.fulfill({ json: sponsored }));
}

test("elevator buttons exist before JavaScript or the client metadata fetch", async ({ browser, request }) => {
  const response = await request.get("/api/floors");
  expect(response.ok()).toBe(true);
  const { floors: stored } = await response.json() as { floors: Floor[] };
  const visible = stored.filter((floor) => !floor.isReference && (floor.status !== "dead" || floor.meta?.kept === true));
  const ordinals = visible.filter((floor) => floor.kind === "floor").map((floor) => floor.ordinal);
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("http://localhost:3147/");
    const loader = page.locator("[data-elevator-arrival]");
    await expect(loader).toBeVisible();
    await expect(loader.getByText("B1", { exact: true })).toBeVisible();
    await expect(loader.getByText("R", { exact: true })).toHaveCount(visible.some((floor) => floor.kind === "roof") ? 1 : 0);
    await expect(loader.locator("[data-floor-row]")).toHaveCount(Math.ceil(Math.max(0, ...ordinals) / 4));
    for (const ordinal of ordinals) await expect(loader.getByText(String(ordinal), { exact: true })).toHaveCount(1);
  } finally {
    await context.close();
  }
});

test("desktop drag coasts, slows, and stops when grabbed again", async ({ page, isMobile }) => {
  test.skip(isMobile, "Mobile keeps native scrolling.");
  await mockBuilding(page);
  await page.goto("/");
  await expect(page.locator('[aria-busy="false"]')).toBeVisible();
  const stack = page.locator('[style*="translate3d"]');
  const y = () => stack.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m42);
  await page.mouse.move(600, 550);
  await page.mouse.down();
  await page.mouse.move(600, 350, { steps: 12 });
  await page.mouse.up();
  const released = await y();
  await page.waitForTimeout(150);
  const early = await y();
  await page.waitForTimeout(150);
  const later = await y();
  expect(released - early).toBeGreaterThan(10);
  expect(early - later).toBeGreaterThan(1);
  expect(early - later).toBeLessThan(released - early);
  await page.mouse.down();
  const stopped = await y();
  await page.waitForTimeout(200);
  expect(await y()).toBeCloseTo(stopped, 0);
  await page.mouse.up();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.mouse.down();
  await page.mouse.move(600, 250, { steps: 8 });
  await page.mouse.up();
  const reduced = await y();
  await page.waitForTimeout(200);
  expect(await y()).toBeCloseTo(reduced, 0);
});

test("loader uses four-column rows, then reveals only arrival images", async ({ page, isMobile }) => {
  const requested: string[] = [];
  page.on("request", (r) => { if (r.url().endsWith("/image")) requested.push(r.url()); });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mockBuilding(page, floors, 250);
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Loading");
  await expect(page.locator('[aria-busy="false"]')).toBeVisible();
  expect(requested.length).toBeGreaterThan(0);
  expect(requested.length).toBeLessThan(15);
  await expect(page.getByRole("button", { name: "Add a floor", exact: true })).toBeVisible();
  if (!isMobile) {
    await page.getByRole("button", { name: "Go to 2", exact: true }).click();
    await expect(page.locator('img[src="/api/floors/floor-2/image"]')).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("momentum survives a relaxed release and a slow animation frame", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop drag only.");
  await mockBuilding(page);
  await page.goto("/");
  await expect(page.locator('[aria-busy="false"]')).toBeVisible();
  const stack = page.locator('[style*="translate3d"]');
  const y = () => stack.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m42);
  await page.mouse.move(500, 550);
  await page.mouse.down();
  await page.mouse.move(500, 350, { steps: 12 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  const released = await y();
  await page.waitForTimeout(100);
  expect(released - await y()).toBeGreaterThan(10);
  await page.evaluate(() => {
    const until = performance.now() + 180;
    while (performance.now() < until) { /* Simulate an expensive render. */ }
  });
  const afterStall = await y();
  await page.waitForTimeout(100);
  expect(afterStall - await y()).toBeGreaterThan(5);
});

test("reveal shows the uncovered floor's literal original prompt", async ({ page, isMobile }) => {
  await mockBuilding(page);
  await page.goto("/");
  await expect(page.locator('[aria-busy="false"]')).toBeVisible();
  if (isMobile) {
    const target = await page.locator("#floor-30").boundingBox();
    if (!target) throw new Error("Missing floor");
    await page.touchscreen.tap(195, target.y + target.height - 10);
  }
  else await page.getByRole("button", { name: "Reveal Room floor-30", exact: true }).click();
  const card = page.getByRole("complementary", { name: "Original prompt for floor 30" });
  await expect(card).toContainText("Original user prompt for floor-30. <b>This is literal text.</b>");
  await expect(card.locator("b")).toHaveCount(0);
  if (!isMobile) {
    const eye = await page.getByRole("button", { name: "Restore Room floor-30", exact: true }).boundingBox();
    const panel = await card.boundingBox();
    expect(eye).not.toBeNull();
    expect(panel).not.toBeNull();
    expect(panel!.x).toBeCloseTo(eye!.x + eye!.width + 12, 0);
    expect(panel!.y).toBeCloseTo(eye!.y, 0);
  }
  if (isMobile) {
    const tile = await page.locator("#floor-30").boundingBox();
    await page.touchscreen.tap(195, tile!.y + tile!.height - 10);
  } else await page.getByRole("button", { name: "Restore Room floor-30", exact: true }).click();
  await expect(card).toHaveCount(0);
});

test("reveal stays open and its card leaves the viewport with the floor", async ({ page, isMobile }) => {
  await mockBuilding(page);
  await page.goto("/");
  await expect(page.locator('[aria-busy="false"]')).toBeVisible();
  const open = async () => {
    if (isMobile) {
      const tile = await page.locator("#floor-30").boundingBox();
      await page.touchscreen.tap(195, tile!.y + tile!.height - 10);
    } else await page.getByRole("button", { name: "Reveal Room floor-30", exact: true }).click();
  };
  const card = page.getByRole("complementary", { name: "Original prompt for floor 30" });
  await open();
  await card.locator("p").click();
  await expect(card).toBeVisible();
  if (isMobile) await page.touchscreen.tap(20, 100);
  else await page.mouse.click(20, 100);
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(1);
  if (!isMobile) {
    await page.mouse.move(100, 500);
    await page.mouse.down();
    await page.mouse.move(100, 450, { steps: 8 });
    await page.mouse.up();
    await expect(card).toHaveCount(1);
    await page.mouse.move(100, 400);
    await page.mouse.wheel(0, 50);
    await expect(card).toHaveCount(1);
    await page.getByRole("button", { name: "Go to 2", exact: true }).click();
    await expect.poll(async () => (await card.boundingBox())!.y).toBeLessThan(-300);
    await expect(page.getByRole("button", { name: "Restore Room floor-30", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Go to 30", exact: true }).click();
    await expect(card).toBeInViewport();
    await page.getByRole("button", { name: "Go to 29", exact: true }).click();
    await page.getByRole("button", { name: "Reveal Room floor-29", exact: true }).click();
    await expect(card).toHaveCount(0);
    const nextCard = page.getByRole("complementary", { name: "Original prompt for floor 29" });
    await expect(nextCard).toHaveCount(1);
    await page.getByRole("button", { name: "Restore Room floor-29", exact: true }).click();
    await expect(nextCard).toHaveCount(0);
  } else {
    await page.evaluate(() => window.scrollBy(0, 800));
    await expect(card).toHaveCount(1);
    await expect.poll(async () => (await card.boundingBox())!.y).toBeLessThan(-300);
  }
});

test("suggestions rotate, fill drafts, hide while editing, and never submit", async ({ page, isMobile }) => {
  let creates = 0;
  let ideaRequests = 0;
  page.on("request", (r) => { if (r.url().endsWith("/api/suggestions")) ideaRequests++; });
  page.on("request", (r) => { if (r.url().endsWith("/api/floors") && r.method() === "POST") creates++; });
  await mockBuilding(page);
  await page.goto("/");
  await expect(page.locator('[aria-busy="false"]')).toBeVisible();
  await expect.poll(() => ideaRequests).toBe(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Add a floor", exact: true }).click();
  await page.getByRole("button", { name: "Idea 1", exact: true }).click();
  await expect(page.getByLabel("DESCRIBE ROOM")).toHaveValue(suggestions[0].prompt);
  await expect(page.getByRole("button", { name: "Idea 2", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "CLOSE", exact: true }).click();
  await page.getByRole("button", { name: "Add a floor", exact: true }).click();
  await expect(page.getByLabel("DESCRIBE ROOM")).toHaveValue(suggestions[0].prompt);
  await page.getByRole("button", { name: "CLEAR", exact: true }).click();
  await expect(page.getByRole("button", { name: "Idea 4", exact: true })).toBeVisible();
  expect(creates).toBe(0);
  expect(ideaRequests).toBe(1);
});

test("background ideas never delay arrival or restart when the dialog reopens", async ({ page }) => {
  await mockBuilding(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  await page.route("**/api/suggestions", async (route) => {
    calls++;
    await gate;
    await route.fulfill({ json: { batchId: "warm-pool", suggestions } });
  });
  await page.goto("/");
  await expect(page.locator('[aria-busy="false"]')).toBeVisible();
  await expect.poll(() => calls).toBe(1);
  await page.getByRole("button", { name: "Add a floor", exact: true }).click();
  await expect(page.getByText("Dreaming up room ideas…")).toBeVisible();
  await page.getByRole("button", { name: "CLOSE", exact: true }).click();
  release();
  await page.getByRole("button", { name: "Add a floor", exact: true }).click();
  await expect(page.getByRole("button", { name: "Idea 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "CLOSE", exact: true }).click();
  await page.getByRole("button", { name: "Add a floor", exact: true }).click();
  await expect(page.getByRole("button", { name: "Idea 4", exact: true })).toBeVisible();
  expect(calls).toBe(1);
});

test("BYOK enables colorful hint badges without public funding", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("nextfloor.keys", JSON.stringify({ anthropic: "browser-hints-key", fal: "browser-floor-key" })));
  await mockBuilding(page);
  await page.route("**/api/floors", (route) => route.fulfill({ json: { floors, sponsored: { ...sponsored, enabled: false, available: false }, serverKeys: false, local: false } }));
  let usedKey = "";
  await page.route("**/api/suggestions", (route) => {
    usedKey = route.request().headers()["x-anthropic-key"];
    return route.fulfill({ json: { batchId: "byok-batch", suggestions: suggestions.map((idea, n) => ({ ...idea, label: ["Alien Café", "Zombie Dance Class", "Conspiracy Lab"][n % 3] + (n > 2 ? ` ${n}` : "") })) } });
  });
  await page.goto("/");
  await expect(page.locator('[aria-busy="false"]')).toBeVisible();
  await page.getByRole("button", { name: "Add a floor", exact: true }).click();
  await expect(page.getByRole("button", { name: "Alien Café", exact: true })).toBeVisible();
  expect(usedKey).toBe("browser-hints-key");
  await expect(page.getByRole("dialog")).toHaveCSS("background-color", "rgb(25, 42, 64)");
  await page.screenshot({ path: testInfo.outputPath("bright-add-floor-hints.png") });
  await page.getByRole("button", { name: "Alien Café", exact: true }).click();
  await expect(page.getByLabel("DESCRIBE ROOM")).toHaveValue(suggestions[0].prompt);
  await expect(page.getByRole("button", { name: "CREATE FLOOR", exact: true })).toBeEnabled();
});

test("development environment key availability enables creation without browser keys", async ({ page }) => {
  await mockBuilding(page);
  await page.route("**/api/floors", (route) => route.fulfill({ json: { floors, sponsored: { ...sponsored, enabled: false, available: false }, serverKeys: true, keyAvailability: { anthropic: true, fal: true }, local: true } }));
  await page.goto("/");
  await expect(page.locator('[aria-busy="false"]')).toBeVisible();
  await page.getByRole("button", { name: "Add a floor", exact: true }).click();
  await page.getByLabel("DESCRIBE ROOM").fill("A room full of friendly aliens.");
  await expect(page.getByRole("button", { name: "CREATE FLOOR", exact: true })).toBeEnabled();
  await expect(page.getByText("Using configured API keys. No shared allowance applies.")).toBeVisible();
});

test("metadata failure retries and reduced-motion empty arrival completes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let failed = true;
  await page.route("**/api/floors", (route) => route.fulfill(failed ? { status: 503, json: {} } : { json: { floors: [], sponsored, local: false } }));
  await page.goto("/");
  await expect(page.getByText("Could not reach the building.", { exact: true })).toBeVisible();
  failed = false;
  await page.getByRole("button", { name: "TRY AGAIN" }).click();
  await expect(page.locator('[aria-busy="false"]')).toBeVisible();
  await expect(page.getByText("No floors yet. Be the first to add one.")).toBeVisible();
});

test("failed image cannot trap arrival and offers retry", async ({ page }) => {
  await mockBuilding(page, floors.slice(0, 2));
  await page.route("**/api/floors/*/image", (route) => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.goto("/");
  await expect(page.locator('[aria-busy="false"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Image unavailable · Retry" }).first()).toBeVisible();
});

test("arrival shows every number in the navigation's four-column layout", async ({ page }, testInfo) => {
  await mockBuilding(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/floors/*/image", async (route) => {
    await gate;
    await route.fulfill({ path: "public/middle-floor.png", contentType: "image/png" });
  });
  await page.goto("/");
  await expect(page.locator("[data-floor-row]")).toHaveCount(8);
  await expect(page.locator("[data-floor-row]").last()).toHaveText("1234");
  const cells = await page.locator("[data-floor-row]").last().locator("span").evaluateAll((elements) => elements.map((el) => el.getBoundingClientRect().toJSON()));
  expect(new Set(cells.map((r) => r.y)).size).toBe(1);
  expect(cells[1].x - cells[0].x).toBe(36);
  await page.screenshot({ path: testInfo.outputPath("elevator-arrival.png") });
  release();
  await expect(page.locator('[aria-busy="false"]')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("building-revealed.png") });
});

test("real API rejects missing and partial keys while sponsorship is disabled", async ({ request }) => {
  const unavailable = await request.post("/api/floors", { data: { theme: "No paid test generation", requestId: crypto.randomUUID() } });
  expect(unavailable.status()).toBe(401);
  expect((await unavailable.json()).code).toBe("disabled");
  const partial = await request.post("/api/floors", { headers: { "x-fal-key": "test-only-invalid" }, data: { theme: "No paid test generation", requestId: crypto.randomUUID() } });
  expect(partial.status()).toBe(401);
  expect((await partial.json()).missing).toContain("an Anthropic key");
});
