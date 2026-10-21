import { readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { newId } from "@fnb/db";
import { vi as text } from "@fnb/pos/messages/vi";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser, Locator } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { putProduct } from "./support/backoffice-calls";
import { openShift, pairedTillWithCashier } from "./support/till-in-browser";

const stack = inject("posStack");
const SEED_PHOTOS = fileURLToPath(new URL("../../scripts/src/dev-stack/seed/images", import.meta.url));
const SHOTS = fileURLToPath(new URL("../../tmp/product-photos", import.meta.url));
const WITH_PHOTO = "Trà sữa trân châu có ảnh";
const WITHOUT_PHOTO = "Trà vải không ảnh";
let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

/** Uploads a photo as the backoffice does: the bytes as the body, as the shop's owner. */
async function uploadPhoto(file: string): Promise<string> {
  const response = await fetch(`${stack.apiOrigin}/media/product-images`, {
    method: "POST",
    headers: { cookie: stack.managerCookie, "content-type": "image/webp" },
    body: await readFile(join(SEED_PHOTOS, file)),
  });
  expect([200, 201]).toContain(response.status);
  return ((await response.json()) as { imageKey: string }).imageKey;
}

const drawnWidth = (tile: Locator) =>
  tile.locator("img").evaluate((image: HTMLImageElement) => (image.complete ? image.naturalWidth : 0));

it("shows a product's photo on its tile, beside a tile of initials, and still does with the photo server gone", async () => {
  const drink = { kind: "prepared_drink", pricingMode: "fixed", taxRateBp: 800 };
  const imageKey = await uploadPhoto("tra-sua-tran-chau.webp");
  await putProduct(stack, newId(), { ...drink, name: WITH_PHOTO, basePrice: 35_000, imageKey }, null);
  await putProduct(stack, newId(), { ...drink, name: WITHOUT_PHOTO, basePrice: 39_000 }, null);

  const till = await pairedTillWithCashier(browser!, stack, "Thu ngân xem ảnh");
  const { page } = till;
  const photoAnswers: number[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/api/media/product-images/")) photoAnswers.push(response.status());
  });
  await openShift(page, []);
  const tile = page.getByRole("button", { name: new RegExp(`^${WITH_PHOTO}`) });
  await expect.poll(() => drawnWidth(tile), { timeout: 20_000 }).toBeGreaterThan(0);
  expect(photoAnswers).toEqual([200]);
  const plain = page.getByRole("button", { name: new RegExp(`^${WITHOUT_PHOTO}`) });
  expect(await plain.locator("img").count()).toBe(0);
  expect(await plain.locator("[data-initial]").getAttribute("data-initial")).toBe("TV");
  await mkdir(SHOTS, { recursive: true });
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: join(SHOTS, `pos-sale-with-photos-${width}.png`) });
  }
  await page.setViewportSize({ width: 800, height: 900 });

  // The photo server is unreachable: after a reload the tile is drawn from the till's copy.
  await page.route(`${stack.posOrigin}/api/media/**`, (route) => route.abort("internetdisconnected"));
  await page.reload();
  await page.getByRole("button", { name: "Thu ngân xem ảnh" }).click();
  for (const digit of "5937") await page.getByRole("button", { name: digit, exact: true }).click();
  await page.getByRole("button", { name: text.staff.submit }).click();
  await page.getByRole("region", { name: text.sale.menuLabel }).waitFor();
  await expect.poll(() => drawnWidth(tile), { timeout: 20_000 }).toBeGreaterThan(0);
  expect(await tile.locator("[data-photo]").getAttribute("data-photo")).toBe("shown");
  expect(photoAnswers).toEqual([200]);
  await till.close();
});
