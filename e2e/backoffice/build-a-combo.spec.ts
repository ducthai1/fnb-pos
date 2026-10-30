import { vi as text } from "@fnb/backoffice/messages/vi";
import { newId } from "@fnb/db";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser, Locator, Page } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import {
  asOwner,
  expectNoOverflow,
  openSection,
  signedInBackoffice,
  statusAfter,
  unexpectedProblems,
} from "./support/backoffice-in-browser";

const stack = inject("backofficeStack");
const T = text.menu.editor;
const P = text.menu.preview;
const DRINK = "Trà vải của combo";
const CAKE = "Bánh bông lan của combo";
const COMBO = "Combo chiều xây trên trang quản lý";
const seeded: string[] = [];
let comboId = "";
let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  // The branch is shared with the other specs: the combo and the two products it holds go off the menu.
  for (const id of [comboId, ...seeded]) {
    if (id !== "") await asOwner(stack, "POST", `/catalog/products/${id}/archive`).catch(console.error);
  }
  await browser?.close();
});

interface PosCombo {
  id: string;
  name: string;
  kind: string;
  basePrice: number | null;
  combo: { slots: { name: string; minSelect: number; maxSelect: number; options: { productId: string; upcharge: number }[] }[] } | null;
}

/** Opens the picker named `label` inside `scope`; its list opens inside `listIn` (the place of the combo it belongs to). */
async function pick(scope: Locator, label: string, choice: string, listIn: Pick<Page, "getByRole"> = scope) {
  await scope.getByRole("combobox", { name: label, exact: true }).click();
  await listIn.getByRole("option", { name: choice, exact: true }).click();
}

it("builds a combo from a drink and a cake, and a till of the branch gets it with its places", async () => {
  const brandId = ((await asOwner(stack, "GET", "/branches")).body as { branches: { id: string; brandId: string }[] }).branches.find(
    (branch) => branch.id === stack.branchId,
  )!.brandId;
  const ids = { drink: newId(), cake: newId() };
  for (const [id, name, price] of [[ids.drink, DRINK, 30_000], [ids.cake, CAKE, 20_000]] as const) {
    expect((await asOwner(stack, "PUT", `/catalog/products/${id}`, { version: null, brandId, kind: "prepared_item", name, basePrice: price, pricingMode: "fixed" })).status).toBe(201);
    seeded.push(id);
  }

  const { page, problems, close } = await signedInBackoffice(browser!, stack);
  await openSection(page, text.shell.nav.products);
  await page.getByRole("link", { name: text.menu.products.add }).click();
  await page.getByRole("heading", { name: T.newTitle }).waitFor();
  comboId = new URL(page.url()).pathname.split("/").pop() ?? "";

  await page.getByLabel(T.name, { exact: true }).fill(COMBO);
  await pick(page.locator("body"), T.kind, T.kinds.combo, page);
  await page.getByLabel(T.basePrice, { exact: true }).fill("45.000");

  // Place 1: exactly one drink. Place 2: one cake, which costs 5.000 more inside the combo.
  const drinks = page.getByRole("region", { name: T.slotLabel(1), exact: true });
  await drinks.getByLabel(T.slotName, { exact: true }).fill("Đồ uống");
  await pick(drinks.getByRole("group", { name: T.slotOptionLabel(1), exact: true }), T.slotProduct, DRINK, drinks);
  await page.getByRole("button", { name: T.addSlot }).click();
  const cakes = page.getByRole("region", { name: T.slotLabel(2), exact: true });
  await cakes.getByLabel(T.slotName, { exact: true }).fill("Bánh");
  const cakeRow = cakes.getByRole("group", { name: T.slotOptionLabel(1), exact: true });
  await pick(cakeRow, T.slotProduct, CAKE, cakes);
  await cakeRow.getByLabel(T.upcharge, { exact: true }).fill("5.000");

  // As the till does: taking the combo with the cake costs the combo's price and the upcharge.
  const preview = page.getByRole("region", { name: P.title });
  await preview.getByLabel(new RegExp(`^${DRINK}`)).check();
  await preview.getByLabel(new RegExp(`^${CAKE}`)).check();
  await expect
    .poll(async () => (await page.locator("[data-preview-total]").textContent())?.replace(/\s/g, " "))
    .toBe(P.comboTotal("50.000 ₫").replace(/\s/g, " "));
  await expectNoOverflow(page, "the combo in the editor");

  expect(await statusAfter(page, `/catalog/products/${comboId}`, () => page.getByRole("button", { name: T.save }).click())).toBe(201);
  await page.getByText(T.saved).waitFor();

  // Opened again from the server, it is the same combo, and its kind cannot change any more.
  await page.reload();
  expect(await page.getByLabel(T.name, { exact: true }).inputValue()).toBe(COMBO);
  await page.getByText(T.comboKindLocked).waitFor();

  const bootstrap = await fetch(`${stack.apiOrigin}/pos/bootstrap`, { headers: { authorization: `Device ${stack.deviceToken}` } });
  expect(bootstrap.status).toBe(200);
  const { menu } = (await bootstrap.json()) as { menu: { products: PosCombo[] } };
  const combo = menu.products.find((product) => product.id === comboId);
  expect(combo).toMatchObject({ name: COMBO, kind: "combo", basePrice: 45_000 });
  expect(combo?.combo?.slots.map((slot) => [slot.name, slot.minSelect, slot.maxSelect, slot.options.map((option) => [option.productId, option.upcharge])])).toEqual([
    ["Đồ uống", 1, 1, [[ids.drink, 0]]],
    ["Bánh", 1, 1, [[ids.cake, 5_000]]],
  ]);
  expect(unexpectedProblems(problems)).toEqual([]);
  await close();
}, 120_000);
