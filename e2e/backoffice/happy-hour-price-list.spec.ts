import { vi as text } from "@fnb/backoffice/messages/vi";
import { newId } from "@fnb/db";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { asOwner, expectNoOverflow, openSection, signedInBackoffice, unexpectedProblems } from "./support/backoffice-in-browser";
import { choose, ruleCard, startPriceList } from "./support/price-list-in-browser";

const stack = inject("backofficeStack");
const T = text.priceLists.editor;
const L = text.priceLists.list;
let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

interface PosPriceList {
  id: string;
  name: string;
  items: { scope: { kind: string; productId?: string }; timeWindow: { startMinute: number; endMinute: number } | null; daysOfWeek: number[] | null; effect: { kind: string; price?: number } }[];
}

const bootstrapLists = async (): Promise<PosPriceList[]> => {
  const response = await fetch(`${stack.apiOrigin}/pos/bootstrap`, { headers: { authorization: `Device ${stack.deviceToken}` } });
  return ((await response.json()) as { menu: { priceLists: PosPriceList[] } }).menu.priceLists;
};

it("creates a 14:00-17:00 happy hour for one drink and the branch's till gets the price in that window", async () => {
  const brandId = ((await asOwner(stack, "GET", "/branches")).body as { branches: { id: string; brandId: string }[] }).branches.find((b) => b.id === stack.branchId)!.brandId;
  const productId = newId();
  const drink = "Trà đào giờ vàng";
  expect((await asOwner(stack, "PUT", `/catalog/products/${productId}`, { version: null, brandId, kind: "prepared_drink", name: drink, basePrice: 40_000, pricingMode: "fixed" })).status).toBe(201);

  const { page, problems, close } = await signedInBackoffice(browser!, stack);
  await openSection(page, text.shell.nav.priceLists);
  await page.getByRole("heading", { name: L.title }).waitFor();
  await startPriceList(page, "Giờ vàng chiều");
  await page.getByRole("button", { name: T.addRule }).click();
  const card = ruleCard(page, 1);
  await choose(card, T.scope, T.scopes.product);
  await choose(card, T.product, drink);
  await choose(card, T.effect, T.effects.fixed_price);
  await card.getByLabel(T.fixedPrice, { exact: true }).fill("30.000");
  await card.getByLabel(T.start, { exact: true }).fill("14:00");
  await card.getByLabel(T.end, { exact: true }).fill("17:00");
  await card.getByText(/Giá 30\.000/).first().waitFor();
  await expectNoOverflow(page, "the new price list");

  const saved = page.waitForResponse((r) => r.request().method() === "PUT" && new URL(r.url()).pathname.startsWith("/api/catalog/price-lists/"));
  await page.getByRole("button", { name: T.save }).click();
  expect((await saved).status()).toBe(201);
  await page.getByText(T.saved).waitFor();

  const listed = (await bootstrapLists()).find((list) => list.name === "Giờ vàng chiều");
  expect(listed?.items).toEqual([
    expect.objectContaining({
      scope: { kind: "product", productId },
      timeWindow: { startMinute: 840, endMinute: 1020 },
      daysOfWeek: null,
      effect: { kind: "fixed_price", price: 30_000 },
    }),
  ]);

  // Back on the list it shows with its rule; a rule left half-typed is refused on its field.
  await openSection(page, text.shell.nav.priceLists);
  await page.getByText("Giờ vàng chiều").first().waitFor();
  await page.getByText(L.rules(1)).first().waitFor();
  await page.getByRole("link", { name: L.edit("Giờ vàng chiều") }).click();
  await page.getByLabel(T.nameLabel, { exact: true }).waitFor();
  await ruleCard(page, 1).getByLabel(T.end, { exact: true }).fill("");
  await page.getByRole("button", { name: T.save }).click();
  await ruleCard(page, 1).getByText(text.priceLists.errors.clockBothOrNone).waitFor();

  // Deleting the list takes the rule off the till.
  await openSection(page, text.shell.nav.priceLists);
  await page.getByRole("button", { name: L.deleteLabel("Giờ vàng chiều") }).click();
  await page.getByRole("button", { name: text.common.remove, exact: true }).click();
  await page.getByText(L.deleted("Giờ vàng chiều")).waitFor();
  expect((await bootstrapLists()).some((list) => list.name === "Giờ vàng chiều")).toBe(false);
  expect(unexpectedProblems(problems)).toEqual([]);
  await close();
});
