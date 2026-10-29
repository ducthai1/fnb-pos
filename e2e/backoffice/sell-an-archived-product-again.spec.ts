import { vi as text } from "@fnb/backoffice/messages/vi";
import { newId } from "@fnb/db";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { asOwner, expectNoOverflow, signedInBackoffice, statusAfter, unexpectedProblems } from "./support/backoffice-in-browser";

const stack = inject("backofficeStack");
const T = text.menu.editor;
let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

const tillProducts = async (): Promise<string[]> => {
  const response = await fetch(`${stack.apiOrigin}/pos/bootstrap`, { headers: { authorization: `Device ${stack.deviceToken}` } });
  return ((await response.json()) as { menu: { products: { name: string }[] } }).menu.products.map((product) => product.name);
};

it("sells a product that was taken off the menu again, and the branch's till gets it back", async () => {
  const brandId = ((await asOwner(stack, "GET", "/branches")).body as { branches: { id: string; brandId: string }[] }).branches.find((b) => b.id === stack.branchId)!.brandId;
  const id = newId();
  const name = "Bánh flan ngừng bán";
  expect((await asOwner(stack, "PUT", `/catalog/products/${id}`, { version: null, brandId, kind: "prepared_drink", name, basePrice: 25_000, pricingMode: "fixed" })).status).toBe(201);
  expect((await asOwner(stack, "POST", `/catalog/products/${id}/archive`)).status).toBe(200);
  expect(await tillProducts()).not.toContain(name);

  const { page, problems, close } = await signedInBackoffice(browser!, stack);
  await page.goto(`${stack.backofficeOrigin}/menu/products/${id}`);
  await page.getByText(T.archived).waitFor();
  await expectNoOverflow(page, "an archived product");
  expect(await statusAfter(page, `/catalog/products/${id}/unarchive`, () => page.getByRole("button", { name: T.resume }).click())).toBe(200);
  await page.getByText(T.resumed).waitFor();
  await page.getByRole("button", { name: T.resume }).waitFor({ state: "detached" });
  expect(((await asOwner(stack, "GET", `/catalog/products/${id}`)).body as { archivedAt: string | null }).archivedAt).toBeNull();
  expect(await tillProducts()).toContain(name);

  // The list now shows it as selling.
  await page.goto(`${stack.backofficeOrigin}/menu`);
  await page.getByRole("link", { name: text.menu.products.edit(name) }).waitFor();
  expect(unexpectedProblems(problems)).toEqual([]);
  await close();
});
