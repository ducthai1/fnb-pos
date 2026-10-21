import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { vi as text } from "@fnb/backoffice/messages/vi";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser, Page } from "playwright-core";
import { sellSampleDay } from "./sample-sales";
import { type SampleShopStack, startSampleShopStack } from "./sample-shop-stack";
import { expectLightPage, saveWebpShot } from "./save-webp-shot";

// `pnpm docs:shots:backoffice`: every picture of the handbook's backoffice part, taken again
// from the sample café on a stack of its own (free ports, throwaway database).

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../../docs/handbook/images/quan-ly");
const WIDE = { width: 1280, height: 860 };
const PHONE = { width: 360, height: 780 };

interface Shot {
  readonly name: string;
  readonly path: (stack: SampleShopStack) => Promise<string> | string;
  readonly viewport?: { width: number; height: number };
  /** What a person does on the page before the picture, such as opening a dialog. */
  readonly act?: (page: Page) => Promise<void>;
}

async function productPath(stack: SampleShopStack, name: string) {
  const response = await fetch(
    `${stack.apiOrigin}/catalog/products?brandId=${stack.shop.brandId}`,
    {
      headers: { cookie: stack.ownerCookie },
    },
  );
  const products = (await response.json()) as { id: string; name: string }[];
  return `/menu/products/${products.find((product) => product.name === name)?.id ?? ""}`;
}

const click = (name: string) => async (page: Page) => {
  await page.getByRole("button", { name, exact: true }).first().click({ timeout: 10_000 });
  await page.waitForTimeout(700);
};

const SHOTS: readonly Shot[] = [
  { name: "tong-quan", path: () => "/" },
  { name: "tong-quan-dien-thoai", path: () => "/", viewport: PHONE },
  { name: "mon", path: () => "/menu" },
  { name: "sua-mon", path: (stack) => productPath(stack, "Trà sữa trân châu") },
  {
    name: "sua-mon-tuy-chon",
    path: (stack) => productPath(stack, "Trà sữa trân châu"),
    act: click(text.menu.editor.sections.groups),
  },
  {
    name: "sua-mon-xem-truoc",
    path: (stack) => productPath(stack, "Trà sữa trân châu"),
    act: click(text.menu.editor.sections.preview),
  },
  { name: "danh-muc", path: () => "/menu/categories" },
  { name: "het-mon", path: () => "/menu/availability" },
  { name: "het-mon-dien-thoai", path: () => "/menu/availability", viewport: PHONE },
  { name: "nhap-excel", path: () => "/menu/import" },
  { name: "nhan-vien", path: () => "/staff" },
  { name: "nhan-vien-khoa", path: () => "/staff", act: click(text.staffTools.lockLabel("Lan")) },
  { name: "vai-tro", path: () => "/roles" },
  { name: "vai-tro-sua", path: () => "/roles", act: click(text.roles.editLabel("Thu ngân")) },
  { name: "thiet-bi", path: () => "/devices" },
  { name: "thiet-bi-ma-ghep", path: () => "/devices", act: click(text.devices.createCode) },
  { name: "so-do-ban", path: () => "/floor" },
  { name: "cai-dat", path: () => "/settings" },
  { name: "cai-dat-thu-tien", path: () => "/settings", act: click(text.settings.groups.money) },
  { name: "cai-dat-hoa-don", path: () => "/settings", act: click(text.settings.groups.invoices) },
  { name: "doanh-thu-ngay", path: () => "/reports/daily-sales" },
  { name: "chot-ngay", path: () => "/day-close" },
  { name: "khop-chuyen-khoan", path: () => "/payments" },
  { name: "phieu-in-loi", path: () => "/reports/print-failures" },
];

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page
    .getByText(text.shell.loading)
    .first()
    .waitFor({ state: "hidden" })
    .catch(() => undefined);
  await page.waitForTimeout(400);
}

async function signedInPage(
  browser: Browser,
  stack: SampleShopStack,
  viewport: { width: number; height: number },
) {
  const context = await browser.newContext({
    viewport,
    colorScheme: "light",
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
  });
  const page = await context.newPage();
  await page.goto(`${stack.backofficeOrigin}/login`);
  await page.locator("form[data-hydrated]").waitFor();
  return { context, page };
}

async function signIn(page: Page, stack: SampleShopStack) {
  await page.getByLabel(text.login.identifierLabel).fill(stack.owner.email);
  await page.getByLabel(text.login.passwordLabel).fill(stack.owner.password);
  await page.getByRole("button", { name: text.login.submit }).click();
  await page.getByLabel(text.shell.branchLabel).waitFor();
}

async function main() {
  await mkdir(OUT, { recursive: true });
  console.log("Dựng quán mẫu trên cổng riêng (Postgres tạm, API, bản build backoffice)…");
  const stack = await startSampleShopStack();
  let browser: Browser | undefined;
  try {
    await sellSampleDay(stack);
    browser = await launchSystemChrome();
    const login = await signedInPage(browser, stack, WIDE);
    await expectLightPage(login.page, "dang-nhap");
    console.log(`dang-nhap.webp ${await saveWebpShot(login.page, join(OUT, "dang-nhap.webp"))} B`);
    await signIn(login.page, stack);
    const state = await login.context.storageState();
    await login.context.close();
    for (const shot of SHOTS) {
      const viewport = shot.viewport ?? WIDE;
      const context = await browser.newContext({
        viewport,
        colorScheme: "light",
        locale: "vi-VN",
        timezoneId: "Asia/Ho_Chi_Minh",
        storageState: state,
      });
      const page = await context.newPage();
      await page.goto(`${stack.backofficeOrigin}${await shot.path(stack)}`);
      await settle(page);
      await shot.act?.(page);
      await expectLightPage(page, shot.name);
      console.log(
        `${shot.name}.webp ${await saveWebpShot(page, join(OUT, `${shot.name}.webp`))} B`,
      );
      await context.close();
    }
  } finally {
    await browser?.close();
    await stack.stop();
  }
}

await main();
