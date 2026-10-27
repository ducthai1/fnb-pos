import { formatVnd, vnd } from "@fnb/domain";
import type { Page } from "playwright-core";
import { expect } from "vitest";
import { vi } from "../../../src/messages/vi";
import { HOSTILE_MENU_NAMES } from "../../../src/test-support/hostile-menu";
import { HOSTILE_NAMES } from "../../../src/test-support/hostile-names";

const NINE_DIGITS = formatVnd(vnd(987_654_321));

/**
 * What a cashier could type on a screen before it is measured: a nine-digit amount and the
 * longest reason the contract takes, with nowhere to wrap.
 */
export async function typeTheWorst(page: Page, name: string) {
  if (["sale-adjusted", "sale-long-cart"].includes(name)) {
    // Every line's actions open under it: the longest the order column gets.
    for (const more of await page.getByRole("button", { name: /^Thao tác món/ }).all()) {
      await more.click();
    }
  }
  if (name === "cash-move") {
    await page.getByLabel(vi.cash.amount).fill("987654321");
    await page.getByLabel(vi.cash.reason).fill(HOSTILE_NAMES.reason);
  }
  if (name === "discount") await page.getByLabel(vi.adjust.discount.typedPercent).fill("12,5");
  if (name === "refund") {
    for (const button of await page.getByRole("button", { name: /^Thêm một/ }).all()) {
      await button.click();
    }
  }
}

/** The hard case is really on screen, so the layout test measures it and not a blank. */
export function expectOperationsText(name: string, text: string) {
  if (["approval-sheet", "void-line", "discount"].includes(name)) {
    expect(text).toContain(HOSTILE_MENU_NAMES.product);
  }
  if (name === "approval-sheet") expect(text).toContain(HOSTILE_NAMES.staff);
  if (name === "sale-adjusted") {
    expect(text).toContain(vi.adjust.cart.lineDiscount);
    expect(text).toContain(vi.adjust.cart.voided(1));
    expect(text).toContain(vi.adjust.tools.voidShort);
  }
  if (name === "close-shift") expect(text).toContain(NINE_DIGITS);
  if (name === "order-history") {
    expect(text).toContain(HOSTILE_NAMES.branch);
    // A card writes "Đơn số …"; the till's table has the number alone in its "Số" column.
    expect(text).toContain("999999939");
  }
  if (name === "refund") {
    expect(text).toContain(HOSTILE_NAMES.staff);
    expect(text).toContain(vi.refund.amount(NINE_DIGITS));
  }
  if (name === "refund-and-close-slips") expect(text).toContain(vi.refund.slipHeading);
}
