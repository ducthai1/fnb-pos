import { vi as text } from "@fnb/backoffice/messages/vi";
import { HOSTILE_MENU, hostileToppingNames } from "@fnb/backoffice/test-support/hostile-catalog";
import { newId } from "@fnb/db";
import { HOSTILE_NAMES } from "@fnb/pos/test-support/hostile-names";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import {
  asOwner,
  expectNoOverflow,
  openSection,
  signedInBackoffice,
  unexpectedProblems,
} from "./support/backoffice-in-browser";
import { groupCard } from "./support/product-editor-in-browser";

const stack = inject("backofficeStack");
let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

/** A product with every name at its worst and a topping group of 30, saved through the API. */
async function hostileProduct(brandId: string): Promise<string> {
  const productId = newId();
  const large = newId();
  const category = await asOwner(stack, "PUT", `/catalog/categories/${newId()}`, {
    version: null,
    brandId,
    name: HOSTILE_MENU.groupName,
    sortOrder: 10,
  });
  expect(category.status).toBe(201);
  const saved = await asOwner(stack, "PUT", `/catalog/products/${productId}`, {
    version: null,
    brandId,
    categoryId: (category.body as { id: string }).id,
    kind: "prepared_drink",
    name: HOSTILE_MENU.productName,
    basePrice: 35_000,
    pricingMode: "fixed",
    variants: [
      { id: newId(), name: "M" },
      { id: large, name: HOSTILE_MENU.sizeName, price: 1_234_567_890 },
    ],
    modifierGroups: [
      {
        id: newId(),
        name: HOSTILE_MENU.groupName,
        minSelect: 0,
        maxSelect: 30,
        allowDuplicates: true,
        options: hostileToppingNames().map((name) => ({ id: newId(), name, priceDelta: 999_999_000 })),
        variantRules: { [large]: { maxSelect: 5 } },
      },
    ],
  });
  expect(saved.status).toBe(201);
  return productId;
}

it("keeps every backoffice page inside a phone and a computer screen with hostile names", async () => {
  const { body } = await asOwner(stack, "GET", "/branches");
  const brandId = (body as { branches: { brandId: string }[] }).branches[0]?.brandId ?? "";
  const productId = await hostileProduct(brandId);
  const roles = (await asOwner(stack, "GET", "/roles")).body as { roles: { id: string }[] };
  const staff = await asOwner(stack, "POST", "/staff", {
    displayName: HOSTILE_NAMES.staff,
    roleId: roles.roles[0]?.id ?? "",
    pin: "4826",
    branchIds: [stack.branchId],
  });
  expect(staff.status).toBe(201);

  const { page, problems, close } = await signedInBackoffice(browser!, stack, { width: 360, height: 900 });
  await page.goto(`${stack.backofficeOrigin}/menu/products/${productId}`);
  await groupCard(page, 1).getByRole("group", { name: text.menu.editor.optionLabel(30), exact: true }).waitFor();
  await expectNoOverflow(page, "the editor with 30 hostile toppings");

  await page.setViewportSize({ width: 360, height: 900 });
  await openSection(page, text.shell.nav.products);
  await page.getByRole("link", { name: text.menu.products.edit(HOSTILE_MENU.productName) }).waitFor();
  await expectNoOverflow(page, "the product list");

  for (const [link, ready] of [
    [text.shell.nav.categories, HOSTILE_MENU.groupName],
    [text.shell.nav.staff, HOSTILE_NAMES.staff],
    [text.shell.nav.availability, HOSTILE_MENU.productName],
  ] as const) {
    await page.setViewportSize({ width: 360, height: 900 });
    await openSection(page, link);
    await page.getByText(ready, { exact: true }).first().waitFor();
    await expectNoOverflow(page, link);
  }
  expect(unexpectedProblems(problems)).toEqual([]);
  await close();
});
