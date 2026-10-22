import { vi as text } from "@fnb/backoffice/messages/vi";
import { ADMIN_SECTIONS } from "@fnb/backoffice/navigation/admin-sections";
import { measureScreenOverflow } from "@fnb/pos/test-support/measure-screen-overflow";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { asOwner, signedInBackoffice, unexpectedProblems } from "./support/backoffice-in-browser";

const stack = inject("backofficeStack");
let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

/** Every page of the menu, the home page, and a product's own page. */
async function everyPage(): Promise<string[]> {
  const { body } = await asOwner(stack, "GET", "/branches");
  const brandId = (body as { branches: { id: string; brandId: string }[] }).branches.find((b) => b.id === stack.branchId)!.brandId;
  const products = (await asOwner(stack, "GET", `/catalog/products?brandId=${brandId}`)).body as { id: string }[];
  const product = products[0] === undefined ? [] : [`/menu/products/${products[0].id}`];
  return ["/", ...ADMIN_SECTIONS.map((section) => section.href), "/menu/import", ...product];
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.getByText(text.shell.loading).first().waitFor({ state: "hidden" }).catch(() => undefined);
}

/** Where the bar's row and the page stand, against the edges of the page's scroller. */
const frameOf = (page: Page) =>
  page.evaluate(() => {
    const main = document.querySelector<HTMLElement>("[data-scroll-root]")!;
    const content = [...main.children].find((child) => child.getClientRects().length > 0)!.getBoundingClientRect();
    const box = main.getBoundingClientRect();
    const brand = document.querySelector("[data-frame=brand]")!.getBoundingClientRect();
    const account = document.querySelector("[data-frame=account]")!.getBoundingClientRect();
    return {
      viewport: window.innerWidth,
      scrollbar: main.offsetWidth - main.clientWidth,
      leftGutter: content.left - box.left,
      rightGutter: box.left + main.clientWidth - content.right,
      contentLeft: content.left,
      contentRight: content.right,
      brandLeft: brand.left,
      accountRight: account.right,
    };
  });

it("fits every page in a phone, a laptop and a desktop screen, measured on the page's scroller", async () => {
  const paths = await everyPage();
  const { page, problems, close } = await signedInBackoffice(browser!, stack);
  for (const width of [1280, 1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of paths) {
      await page.goto(`${stack.backofficeOrigin}${path}`);
      await settle(page);
      const overflow = await measureScreenOverflow(page);
      expect(overflow, `${path} at ${width}px`).toMatchObject({ scrollerExcess: 0, pageExcess: 0, outside: [] });
    }
  }
  expect(unexpectedProblems(problems)).toEqual([]);
  await close();
});

it("stretches the page with the screen in one column the bar shares, its gutters even", async () => {
  const { page, close } = await signedInBackoffice(browser!, stack);
  for (const width of [1280, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${stack.backofficeOrigin}/menu`);
    await settle(page);
    const frame = await frameOf(page);
    // The gutter of backoffice-tokens.css: clamp(16px, 2.5vw, 48px).
    const gutter = Math.min(48, Math.max(16, width * 0.025));
    expect(frame.leftGutter, `left gutter at ${width}px`).toBeCloseTo(gutter, 0);
    expect(Math.abs(frame.rightGutter - frame.leftGutter), `even gutters at ${width}px`).toBeLessThanOrEqual(1);
    expect(Math.abs(frame.contentRight - (frame.viewport - frame.scrollbar - gutter)), `right edge at ${width}px`).toBeLessThanOrEqual(1);
    expect(Math.abs(frame.brandLeft - frame.contentLeft), `bar and page start together at ${width}px`).toBeLessThanOrEqual(1);
    expect(Math.abs(frame.accountRight - frame.contentRight), `bar and page end together at ${width}px`).toBeLessThanOrEqual(1);
    expect(await measureScreenOverflow(page), `${width}px`).toMatchObject({ scrollerExcess: 0, pageExcess: 0, outside: [] });
  }
  await close();
});

it("keeps a long list's head in sight while it scrolls, a page of 25 at a time", async () => {
  const { page, close } = await signedInBackoffice(browser!, stack, { width: 1280, height: 800 });
  // Sixty products on the way to the page only: the shop the other specs share keeps its own.
  await page.route(
    (url) => url.pathname === "/api/catalog/products",
    (route) =>
      route.fulfill({
        json: Array.from({ length: 60 }, (_, at) => ({
          id: `0190a000-0000-7000-8000-${String(at).padStart(12, "0")}`,
          name: `Món dài ${String(at + 1).padStart(2, "0")}`,
          kind: "prepared_drink",
          categoryId: null,
          basePrice: 30_000 + at * 1_000,
          pricingMode: "fixed",
          version: 1,
          archivedAt: null,
          imageUrl: null,
        })),
      }),
  );
  await page.goto(`${stack.backofficeOrigin}/menu`);
  await settle(page);
  const table = page.getByRole("table", { name: text.menu.products.title });
  await expect.poll(() => table.locator("tbody tr").count()).toBe(25);
  const pager = page.getByRole("navigation", { name: text.table.pager });
  await pager.getByText(text.table.range(1, 25, 60)).waitFor();

  await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>("[data-scroll-root]")!;
    main.scrollTop = main.scrollHeight;
  });
  const { headTop, scrollerTop, scrolled } = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>("[data-scroll-root]")!;
    return {
      headTop: document.querySelector("table thead th")!.getBoundingClientRect().top,
      scrollerTop: main.getBoundingClientRect().top,
      scrolled: main.scrollTop,
    };
  });
  expect(scrolled).toBeGreaterThan(400);
  expect(Math.abs(headTop - scrollerTop)).toBeLessThanOrEqual(1);

  await pager.getByRole("button", { name: text.table.nextPage }).click();
  await pager.getByText(text.table.range(26, 50, 60)).waitFor();
  await expect.poll(() => table.locator("tbody tr").first().textContent()).toContain("Món dài 26");
  await close();
});

it("keeps the add button level with its box when the box says what is wrong", async () => {
  const { page, close } = await signedInBackoffice(browser!, stack, { width: 1440, height: 900 });
  await page.goto(`${stack.backofficeOrigin}/floor`);
  await settle(page);
  const field = page.getByLabel(text.floor.newAreaLabel);
  await field.waitFor();
  expect(await field.getAttribute("aria-invalid")).toBeNull();
  await page.getByRole("button", { name: text.floor.addArea }).click();
  await page.getByText(text.floor.nameInvalid(60)).waitFor();
  const [box, button] = await Promise.all([
    field.boundingBox(),
    page.getByRole("button", { name: text.floor.addArea }).boundingBox(),
  ]);
  expect(Math.abs(box!.y - button!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(box!.height - button!.height)).toBeLessThanOrEqual(1);
  await close();
});
