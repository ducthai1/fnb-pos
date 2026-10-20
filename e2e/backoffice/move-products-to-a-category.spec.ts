import { vi as text } from "@fnb/backoffice/messages/vi";
import { newId } from "@fnb/db";
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

const stack = inject("backofficeStack");
const T = text.menu.products;
let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

const SMOOTHIES = ["Smoothie bơ", "Smoothie xoài", "Smoothie dâu"];

it("moves the products a search shows to a category, each kept whole", async () => {
  const { body } = await asOwner(stack, "GET", "/branches");
  const brandId = (body as { branches: { brandId: string }[] }).branches[0]?.brandId ?? "";
  const category = await asOwner(stack, "PUT", `/catalog/categories/${newId()}`, {
    version: null,
    brandId,
    name: "Sinh tố",
    sortOrder: 900,
  });
  expect(category.status).toBe(201);
  const categoryId = (category.body as { id: string }).id;
  const ids: string[] = [];
  for (const name of SMOOTHIES) {
    const id = newId();
    ids.push(id);
    const saved = await asOwner(stack, "PUT", `/catalog/products/${id}`, {
      version: null,
      brandId,
      kind: "prepared_drink",
      name,
      basePrice: 40_000,
      pricingMode: "fixed",
      taxRateBp: 800,
      variants: [{ id: newId(), name: "L", price: 45_000 }],
    });
    expect(saved.status).toBe(201);
  }

  const { page, problems, close } = await signedInBackoffice(browser!, stack);
  await openSection(page, text.shell.nav.products);
  await page.getByLabel(T.search).fill("smoothie");
  await page.getByRole("checkbox", { name: T.pickAll }).check();
  const bar = page.getByRole("region", { name: T.picked(SMOOTHIES.length) });
  await bar.getByLabel(T.moveTo).selectOption({ label: "Sinh tố" });
  await expectNoOverflow(page, "the product list with ticked products");
  await page.setViewportSize({ width: 1280, height: 900 });
  await bar.getByRole("button", { name: T.move }).click();
  await page.getByText(T.moved(SMOOTHIES.length, "Sinh tố")).waitFor();

  for (const id of ids) {
    const product = (await asOwner(stack, "GET", `/catalog/products/${id}`)).body as {
      categoryId: string | null;
      version: number;
      taxRateBp: number;
      variants: unknown[];
    };
    expect(product).toMatchObject({ categoryId, version: 2, taxRateBp: 800 });
    expect(product.variants).toHaveLength(1);
  }
  expect(unexpectedProblems(problems)).toEqual([]);
  await close();
});
