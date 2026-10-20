import { vi as text } from "@fnb/backoffice/messages/vi";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import {
  expectNoOverflow,
  openSection,
  signedInBackoffice,
  statusAfter,
  unexpectedProblems,
} from "./support/backoffice-in-browser";
import { addGroup, addInPreview, addSize, groupCard, preview } from "./support/product-editor-in-browser";

const stack = inject("backofficeStack");
const T = text.menu.editor;
const P = text.menu.preview;
let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

interface PosProduct {
  id: string;
  name: string;
  variants: { id: string; name: string; price: number | null }[];
  modifierGroups: { name: string; minSelect: number; maxSelect: number; options: { name: string }[]; variantRules: Record<string, { maxSelect?: number }> }[];
}

it("builds a pearl milk tea with sizes, sugar, ice and toppings, and a till of the branch gets it", async () => {
  const { page, problems, close } = await signedInBackoffice(browser!, stack);
  await openSection(page, text.shell.nav.products);
  await page.getByRole("link", { name: text.menu.products.add }).click();
  await page.getByRole("heading", { name: T.newTitle }).waitFor();

  await page.getByLabel(T.name, { exact: true }).fill("Trà sữa trân châu");
  await page.getByLabel(T.basePrice, { exact: true }).fill("35.000");
  await addSize(page, 1, "M");
  await addSize(page, 2, "L", "45.000");
  await addGroup(page, 1, { name: "Đường", minSelect: "1", maxSelect: "1", options: [{ name: "100%" }, { name: "70%" }, { name: "50%" }] });
  await addGroup(page, 2, { name: "Đá", minSelect: "1", maxSelect: "1", options: [{ name: "Bình thường" }, { name: "Ít đá" }, { name: "Không đá" }] });
  await addGroup(page, 3, {
    name: "Topping",
    minSelect: "0",
    maxSelect: "3",
    allowDuplicates: true,
    options: [
      { name: "Trân châu đen", priceDelta: "5.000", maxQuantity: "2" },
      { name: "Thạch", priceDelta: "5.000" },
      { name: "Pudding", priceDelta: "7.000" },
    ],
  });
  const ruleL = groupCard(page, 3).getByRole("group", { name: T.ruleLabel("L"), exact: true });
  await ruleL.getByLabel(T.ruleMax, { exact: true }).fill("5");

  // As a customer would order an L: five toppings pass, a sixth is refused on the toppings.
  await preview(page).getByRole("radio", { name: "L", exact: true }).check();
  await preview(page).getByRole("checkbox", { name: /^50%/ }).check();
  await preview(page).getByRole("checkbox", { name: /^Ít đá/ }).check();
  await addInPreview(page, "Thạch", 3);
  await addInPreview(page, "Pudding", 2);
  await expect.poll(() => preview(page).locator("[data-preview-total]").textContent()).toMatch(/74\.000\s₫$/);
  await addInPreview(page, "Trân châu đen", 1);
  await preview(page).getByRole("group", { name: "Topping" }).getByText(P.tooMany(5, 6)).waitFor();
  await expectNoOverflow(page, "the milk tea in the editor");

  const save = page.getByRole("button", { name: T.save });
  const productId = new URL(page.url()).pathname.split("/").pop() ?? "";
  expect(await statusAfter(page, `/catalog/products/${productId}`, () => save.click())).toBe(201);
  await page.getByText(T.saved).waitFor();

  // Opened again from the server, it is the same product.
  await page.reload();
  await groupCard(page, 3).waitFor();
  expect(await page.getByLabel(T.name, { exact: true }).inputValue()).toBe("Trà sữa trân châu");
  expect(await groupCard(page, 3).getByLabel(T.groupName, { exact: true }).inputValue()).toBe("Topping");
  expect(await ruleL.getByLabel(T.ruleMax, { exact: true }).inputValue()).toBe("5");
  const sizeL = page.getByRole("group", { name: T.variantLabel(2), exact: true });
  expect(await sizeL.getByLabel(T.variantPrice, { exact: true }).inputValue()).toBe("45.000");

  // What a till of the branch pulls when it starts.
  const bootstrap = await fetch(`${stack.apiOrigin}/pos/bootstrap`, { headers: { authorization: `Device ${stack.deviceToken}` } });
  expect(bootstrap.status).toBe(200);
  const { menu } = (await bootstrap.json()) as { menu: { products: PosProduct[] } };
  const tea = menu.products.find((product) => product.id === productId);
  expect(tea?.name).toBe("Trà sữa trân châu");
  expect(tea?.variants.map((variant) => [variant.name, variant.price])).toEqual([["M", null], ["L", 45_000]]);
  expect(tea?.modifierGroups.map((group) => [group.name, group.minSelect, group.maxSelect, group.options.length])).toEqual([
    ["Đường", 1, 1, 3],
    ["Đá", 1, 1, 3],
    ["Topping", 0, 3, 3],
  ]);
  const largeId = tea?.variants[1]?.id ?? "";
  expect(tea?.modifierGroups[2]?.variantRules[largeId]).toEqual({ maxSelect: 5 });
  expect(unexpectedProblems(problems)).toEqual([]);
  await close();
});
