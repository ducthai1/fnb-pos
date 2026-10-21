import { vi as text } from "@fnb/backoffice/messages/vi";
import { measureScreenOverflow } from "@fnb/pos/test-support/measure-screen-overflow";
import { HOSTILE_NAMES } from "@fnb/pos/test-support/hostile-names";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { openSection, signedInBackoffice, unexpectedProblems } from "./support/backoffice-in-browser";

const stack = inject("backofficeStack");
const T = text.shell;
const G = T.groups;
let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

/** The organization's name at the API's 80 characters, with nowhere to wrap. */
const SHOP_NAME = "CôngTyTNHHMộtThànhViênTràSữaVàCàPhêMuối".repeat(3).slice(0, 80);

/**
 * The bar as a shop with the longest names would see it. The names are swapped in the
 * answers on their way to the page, so the shop the other specs share keeps its own.
 */
async function withHostileNames(page: Page) {
  await page.route("**/api/auth/me", async (route) => {
    const response = await route.fetch();
    const member = (await response.json()) as Record<string, unknown>;
    await route.fulfill({ response, json: { ...member, organizationName: SHOP_NAME, displayName: HOSTILE_NAMES.staff } });
  });
  await page.route("**/api/branches", async (route) => {
    const response = await route.fetch();
    const { branches } = (await response.json()) as { branches: Record<string, unknown>[] };
    const names = [HOSTILE_NAMES.branch, HOSTILE_NAMES.emoji];
    await route.fulfill({ response, json: { branches: branches.map((branch, at) => ({ ...branch, name: names[at % 2] })) } });
  });
  await page.reload();
  await page.getByLabel(T.branchLabel).waitFor();
}

/** Boxes of `selector` and everything in it that reach past the screen; `vertical` also counts top and bottom. */
const outsideOfScreen = (page: Page, selector: string, vertical: boolean) =>
  page.evaluate(
    ({ selector, vertical }) => {
      const root = document.querySelector<HTMLElement>(selector);
      if (root === null) throw new Error(`no ${selector} on the screen`);
      const width = document.documentElement.clientWidth;
      const height = window.innerHeight;
      const outside = [root, ...root.querySelectorAll<HTMLElement>("*")].filter((element) => {
        const box = element.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) return false;
        const sideways = box.left < -0.5 || box.right > width + 0.5;
        return sideways || (vertical && (box.top < -0.5 || box.bottom > height + 0.5));
      });
      return {
        outside: outside.map((element) => `${element.tagName.toLowerCase()}.${element.className}`),
        excess: root.scrollWidth - root.clientWidth,
      };
    },
    { selector, vertical },
  );

/** A new width, measured only once the page has swapped to that width's menu. */
async function resize(page: Page, width: number) {
  await page.setViewportSize({ width, height: 800 });
  const wide = width >= 1024;
  await (wide ? page.getByRole("navigation", { name: T.navigation }) : page.getByRole("button", { name: T.openMenu })).waitFor();
}

async function expectShopNameCutNotPushing(page: Page, width: number) {
  const name = await page.locator(".bo-topbar__name .bo-clip").evaluate((element) => ({
    shown: element.clientWidth,
    cut: element.scrollWidth > element.clientWidth,
  }));
  expect(name.cut, `shop name cut with "…" at ${width}px`).toBe(true);
  expect(name.shown, `shop name still readable at ${width}px`).toBeGreaterThan(40);
  expect(await outsideOfScreen(page, ".bo-topbar", true), `bar at ${width}px`).toEqual({ outside: [], excess: 0 });
  expect(await measureScreenOverflow(page), `page at ${width}px`).toMatchObject({ scrollerExcess: 0, pageExcess: 0, outside: [] });
}

it("keeps the bar, every group's list and the drawer inside the screen with the longest names", async () => {
  const { page, problems, close } = await signedInBackoffice(browser!, stack, { width: 1280, height: 800 });
  await withHostileNames(page);
  const nav = page.getByRole("navigation", { name: T.navigation });

  for (const width of [1024, 1280]) {
    await resize(page, width);
    await expectShopNameCutNotPushing(page, width);
    const headings = nav.getByRole("button");
    expect(await headings.allTextContents()).toEqual([G.people, G.menu, G.sales, G.shop]);
    const tops = await headings.evaluateAll((all) => all.map((element) => element.getBoundingClientRect().top));
    expect(new Set(tops).size, `the groups in one row at ${width}px`).toBe(1);
    for (const group of [G.people, G.menu, G.sales, G.shop]) {
      await nav.getByRole("button", { name: group, exact: true }).click();
      const list = nav.getByRole("list", { name: group });
      await list.waitFor();
      const id = await list.getAttribute("id");
      expect(await outsideOfScreen(page, `#${id}`, true), `${group} list at ${width}px`).toEqual({ outside: [], excess: 0 });
    }
    await page.getByRole("main").click({ position: { x: 4, y: 4 } });
    expect(await nav.getByRole("list").filter({ visible: true }).count()).toBe(1);
  }

  for (const width of [360, 800]) {
    await resize(page, width);
    await expectShopNameCutNotPushing(page, width);
    await page.getByRole("button", { name: T.openMenu }).click();
    await expect.poll(() => nav.getByRole("link").count()).toBe(13);
    expect(await outsideOfScreen(page, ".bo-drawer", false), `drawer at ${width}px`).toEqual({ outside: [], excess: 0 });
    const drawer = await nav.evaluate((element) => element.getBoundingClientRect().toJSON() as DOMRect);
    expect(drawer.bottom, `drawer ends on the screen at ${width}px`).toBeLessThanOrEqual(800);
    await page.keyboard.press("Escape");
    await expect.poll(() => nav.count()).toBe(0);
    expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-expanded"))).toBe("false");
  }
  expect(unexpectedProblems(problems)).toEqual([]);
  await close();
});

it("opens and closes a group's list with the keyboard and marks the page on screen", async () => {
  const { page, problems, close } = await signedInBackoffice(browser!, stack, { width: 1280, height: 800 });
  const nav = page.getByRole("navigation", { name: T.navigation });
  const menu = nav.getByRole("button", { name: G.menu, exact: true });
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => menu.getAttribute("aria-expanded")).toBe("true");
  await page.keyboard.press("Escape");
  await expect.poll(() => menu.getAttribute("aria-expanded")).toBe("false");
  expect(await menu.evaluate((element) => element === document.activeElement)).toBe(true);
  await page.keyboard.press("Space");
  await expect.poll(() => menu.getAttribute("aria-expanded")).toBe("true");
  await page.keyboard.press("ArrowDown");
  expect(await page.evaluate(() => document.activeElement?.textContent)).toBe(T.nav.products);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForURL("**/menu/categories");
  await expect.poll(() => menu.getAttribute("aria-current")).toBe("true");
  expect(await nav.getByRole("list").filter({ visible: true }).count()).toBe(1);
  await menu.click();
  expect(await nav.getByRole("link", { name: T.nav.categories }).getAttribute("aria-current")).toBe("page");

  await resize(page, 360);
  await openSection(page, T.nav.dailySales);
  await page.waitForURL("**/reports/daily-sales");
  await page.getByRole("button", { name: T.openMenu }).click();
  expect(await nav.getByRole("link", { name: T.nav.dailySales }).getAttribute("aria-current")).toBe("page");
  expect(unexpectedProblems(problems)).toEqual([]);
  await close();
});
