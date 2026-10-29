import { vi as text } from "@fnb/backoffice/messages/vi";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { asOwner, expectNoOverflow, openSection, signedInBackoffice, unexpectedProblems } from "./support/backoffice-in-browser";

const stack = inject("backofficeStack");
const T = text.shopTemplates;
let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

const brandId = async (): Promise<string> =>
  ((await asOwner(stack, "GET", "/branches")).body as { branches: { id: string; brandId: string }[] }).branches.find((b) => b.id === stack.branchId)!.brandId;

const tillMenu = async () => {
  const response = await fetch(`${stack.apiOrigin}/pos/bootstrap`, { headers: { authorization: `Device ${stack.deviceToken}` } });
  return ((await response.json()) as { menu: { stations: { name: string }[]; categories: { name: string }[] } }).menu;
};

it("previews a bakery's template, applies it without touching a switch the owner chose, and a second apply adds nothing", async () => {
  // The owner turned the switch off on purpose: the template wants it on and must leave it.
  expect((await asOwner(stack, "PUT", `/settings/branch/${stack.branchId}/kitchen_routing`, { value: false })).status).toBe(200);
  const { page, problems, close } = await signedInBackoffice(browser!, stack);
  await openSection(page, text.shell.nav.shopTemplates);
  await page.getByRole("heading", { name: T.title }).waitFor();
  await page.getByRole("radio", { name: /Tiệm bánh/ }).click();
  await page.getByRole("heading", { name: /Mẫu “Tiệm bánh” sẽ làm gì/ }).waitFor();
  await page.getByRole("list", { name: /^Danh mục \(\d+\)$/ }).getByText("Bánh mì").waitFor();
  await page.getByText(T.keptChosen("Chia phiếu theo trạm pha chế/bếp", false, true)).waitFor();
  await expectNoOverflow(page, "the shop template page");

  await page.getByRole("button", { name: /^Áp dụng cho / }).click();
  await page.getByRole("button", { name: T.confirm, exact: true }).click();
  await page.getByText(/^Đã thêm /).waitFor();
  await page.getByText(T.nothing).waitFor();

  const categories = ((await asOwner(stack, "GET", `/catalog/categories?brandId=${await brandId()}`)).body as { name: string }[]).map((row) => row.name);
  expect(categories).toEqual(expect.arrayContaining(["Bánh mì", "Bánh kem"]));
  const menu = await tillMenu();
  expect(menu.stations.map((station) => station.name)).toEqual(expect.arrayContaining(["Quầy bánh", "Quầy nước"]));
  expect(menu.categories.map((category) => category.name)).toContain("Bánh mì");

  const again = await asOwner(stack, "POST", "/shop-templates/bakery/apply", { branchId: stack.branchId });
  expect(again).toMatchObject({ status: 200, body: { changes: [] } });
  const settings = (await asOwner(stack, "GET", `/settings?scope=branch&scopeId=${stack.branchId}`)).body as { entries: { key: string; value: unknown }[] };
  expect(settings.entries.find((entry) => entry.key === "kitchen_routing")?.value).toBe(false);
  expect(unexpectedProblems(problems)).toEqual([]);
  await close();
});
