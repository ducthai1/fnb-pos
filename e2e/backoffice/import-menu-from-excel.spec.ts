import { vi as text } from "@fnb/backoffice/messages/vi";
import { writeXlsxSheet } from "@fnb/backoffice/sheet/write-xlsx-sheet";
import { HOSTILE_MENU } from "@fnb/backoffice/test-support/hostile-catalog";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import {
  expectNoOverflow,
  openSection,
  signedInBackoffice,
  unexpectedProblems,
} from "./support/backoffice-in-browser";

const stack = inject("backofficeStack");
const T = text.menuImport;
let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

/** Ten drinks of a shop moving over, in two groups, as another POS exports them. */
const DRINKS: readonly (readonly [string, string, string, number])[] = [
  ["CF01", "Cà phê muối nhập", "Cà phê nhập", 32_000],
  ["CF02", "Bạc xỉu nhập", "Cà phê nhập", 29_000],
  ["CF03", "Cà phê đen nhập", "Cà phê nhập", 22_000],
  ["CF04", "Cà phê sữa nhập", "Cà phê nhập", 25_000],
  ["CF05", "Cold brew nhập", "Cà phê nhập", 39_000],
  ["TR01", "Trà đào nhập", "Trà nhập", 35_000],
  ["TR02", "Trà vải nhập", "Trà nhập", 35_000],
  ["TR03", "Trà tắc nhập", "Trà nhập", 18_000],
  ["TR04", "Trà sen vàng nhập", "Trà nhập", 45_000],
  ["TR05", "Hồng trà sữa nhập", "Trà nhập", 33_000],
];

const sheet = () =>
  Buffer.from(
    writeXlsxSheet("Products", [
      ["Mã hàng hóa", "Tên hàng hóa", "Tên nhóm", "ĐVT", "Giá bán", "Giá vốn", "Tồn kho"],
      ...DRINKS.map(([code, name, group, price]) => [code, name, group, "Ly", price, 12_000, 40]),
      // A line a person must fix: its price below zero, its name at its worst.
      ["XX99", HOSTILE_MENU.productName, HOSTILE_MENU.groupName, "Ly", -5_000, null, null],
    ]),
  );

async function pickSheet(page: Page) {
  await page.getByLabel(T.fileLabel).setInputFiles({
    name: "hang-hoa.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: sheet(),
  });
  await page.getByText(T.fileRead("hang-hoa.xlsx", 11)).waitFor();
}

interface TillMenu {
  menu: {
    categories: { id: string; name: string }[];
    products: { name: string; basePrice: number | null; categoryId: string | null }[];
  };
}

it("imports ten drinks from a sheet once, and a till of the branch gets them in their groups", async () => {
  const { page, problems, close } = await signedInBackoffice(browser!, stack);
  await openSection(page, text.shell.nav.products);
  await page.getByRole("link", { name: T.open }).click();
  await page.getByRole("heading", { name: T.title }).waitFor();
  await pickSheet(page);

  const table = page.getByRole("table", { name: T.previewLabel });
  await expect.poll(() => table.locator('[data-import-status="new"]').count()).toBe(10);
  await table.locator('[data-import-status="error"]').getByText(text.common.amountInvalid).waitFor();
  const ignored = page.getByRole("note", { name: T.ignoredTitle });
  expect(await ignored.textContent()).toContain("ĐVT, Giá vốn, Tồn kho");
  await expectNoOverflow(page, "the preview of a sheet with a hostile line");

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: T.start(10) }).click();
  await page.getByText(T.finished(10, 0)).waitFor({ timeout: 60_000 });
  await page.getByText(T.nothingToImport).waitFor();

  // The same file again: every drink is on the menu already, so nothing is written twice.
  await pickSheet(page);
  await expect.poll(() => table.locator('[data-import-status="same"]').count()).toBe(10);
  await page.getByText(T.nothingToImport).waitFor();

  const bootstrap = await fetch(`${stack.apiOrigin}/pos/bootstrap`, {
    headers: { authorization: `Device ${stack.deviceToken}` },
  });
  expect(bootstrap.status).toBe(200);
  const { menu } = (await bootstrap.json()) as TillMenu;
  const groupOf = (id: string | null) => menu.categories.find((category) => category.id === id)?.name;
  const imported = menu.products.filter((product) => product.name.endsWith(" nhập"));
  expect(
    imported
      .map((product) => [product.name, groupOf(product.categoryId), product.basePrice])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  ).toEqual(
    DRINKS.map(([, name, group, price]) => [name, group, price]).sort((a, b) =>
      String(a[0]).localeCompare(String(b[0])),
    ),
  );
  expect(menu.categories.filter((category) => category.name.endsWith(" nhập"))).toHaveLength(2);
  expect(unexpectedProblems(problems)).toEqual([]);
  await close();
});
