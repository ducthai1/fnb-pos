import { vi as text } from "@fnb/backoffice/messages/vi";
import { HOSTILE_MENU } from "@fnb/backoffice/test-support/hostile-catalog";
import { newId } from "@fnb/db";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { asOwner, expectNoOverflow, signedInBackoffice, unexpectedProblems } from "./support/backoffice-in-browser";

const stack = inject("backofficeStack");
let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

const brandOf = async (): Promise<string> =>
  ((await asOwner(stack, "GET", "/branches")).body as { branches: { id: string; brandId: string }[] }).branches.find((b) => b.id === stack.branchId)!.brandId;

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.getByText(text.shell.loading).first().waitFor({ state: "hidden" }).catch(() => undefined);
}

/** As long as a name goes, with no space to wrap at. */
const LONG = HOSTILE_MENU.productName;

it("keeps the price list pages inside a phone and a computer screen with 60 hostile rules", async () => {
  const brandId = await brandOf();
  const product = newId();
  expect((await asOwner(stack, "PUT", `/catalog/products/${product}`, { version: null, brandId, kind: "prepared_drink", name: LONG, basePrice: 35_000, pricingMode: "fixed" })).status).toBe(201);
  const rule = (at: number) => ({
    id: newId(),
    scope: at % 3 === 0 ? { kind: "global" } : { kind: "product", productId: product },
    branchId: at % 2 === 0 ? stack.branchId : null,
    channelKey: at % 5 === 0 ? "k".repeat(40) : null,
    validFrom: at % 7 === 0 ? "2026-11-01T00:00:00.000Z" : null,
    validTo: at % 7 === 0 ? "2026-11-08T00:00:00.000Z" : null,
    daysOfWeek: at % 4 === 0 ? [0, 1, 2, 3, 4, 5, 6] : [1, 3, 5],
    timeWindow: { startMinute: 600 + at, endMinute: 1100 },
    effect: at % 3 === 0 ? { kind: "percent_off", rateBp: 1250, rounding: "half-up" } : { kind: "fixed_price", price: 1_234_567_890 },
    priority: at,
  });
  const listId = newId();
  const saved = await asOwner(stack, "PUT", `/catalog/price-lists/${listId}`, { version: null, brandId, name: LONG, items: Array.from({ length: 60 }, (_, at) => rule(at)) });
  expect(saved.status).toBe(201);
  const { page, problems, close } = await signedInBackoffice(browser!, stack);
  for (const path of ["/menu/price-lists", `/menu/price-lists/${listId}`]) {
    await page.goto(`${stack.backofficeOrigin}${path}`);
    await settle(page);
    await page.getByText(LONG).first().waitFor();
    await expectNoOverflow(page, path);
  }
  expect(unexpectedProblems(problems)).toEqual([]);
  await close();
});
