import { formatVnd } from "@fnb/domain";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { HOSTILE_MENU_NAMES } from "../../src/test-support/hostile-menu";
import { HOSTILE_NAMES } from "../../src/test-support/hostile-names";
import { vi } from "../../src/messages/vi";
import { HOSTILE_FLOOR_NAMES, NINE_DIGIT_BILL } from "./pages/hostile-floor";
import { HOSTILE_INVOICE } from "./pages/hostile-sale";
import { SCREEN_NAMES } from "./pages/screen-names";
import { expectOperationsText, typeTheWorst } from "./support/hostile-operations-input";
import { measureScreenOverflow } from "./support/measure-screen-overflow";

let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

describe.each([360, 800, 1280])("the POS screens at %ipx wide with hostile names", (width) => {
  it.each(SCREEN_NAMES)("%s stays within the screen", async (name) => {
    const page = await browser!.newPage({ viewport: { width, height: 640 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${inject("screensOrigin")}/screens.html?screen=${name}`);
    await page.waitForFunction(`document.body.dataset.screenReady === "${name}"`);
    await typeTheWorst(page, name);
    const overflow = await measureScreenOverflow(page);
    // Every table of the hostile floor is on screen, so the grid is measured full.
    const tableTiles = ["floor", "floor-plan"].includes(name)
      ? await page.locator("[data-table]").count()
      : null;
    // A typed value is not in the screen's text: read it off the field it fills.
    const buyerName =
      name === "buyer-info" ? await page.locator('input[name="buyer-name"]').inputValue() : null;
    await page.close();
    expect(errors).toEqual([]);
    expect(overflow).toMatchObject({ scrollerExcess: 0, pageExcess: 0, outside: [] });
    if (["staff-picker", "pin-entry", "open-shift", "sale", "modifier-picker"].includes(name)) {
      // The long name is really on screen, so the test is measuring the hard case.
      expect(overflow.text).toContain(HOSTILE_NAMES.staff);
    }
    if (["sale", "sale-long-cart", "modifier-picker"].includes(name)) {
      expect(overflow.text).toContain(HOSTILE_MENU_NAMES.product);
    }
    if (name === "sale-long-cart") {
      expect(overflow.text).toContain(vi.sale.removeShort);
      expect(overflow.text).toContain(vi.adjust.tools.discountShort);
    }
    if (name === "qr-payment") expect(overflow.text).toContain(HOSTILE_NAMES.staff);
    if (name === "payment") expect(overflow.text).toContain(HOSTILE_NAMES.branch);
    if (name === "sale-done-invoice") expect(overflow.text).toContain(HOSTILE_INVOICE.lookupCode);
    if (name === "buyer-info") expect(buyerName).toContain(HOSTILE_NAMES.staff);
    if (["floor", "floor-plan", "table-order", "transfer-table"].includes(name)) {
      expect(overflow.text).toContain(HOSTILE_FLOOR_NAMES.table);
    }
    if (["floor", "floor-plan"].includes(name)) {
      expect(overflow.text).toContain(HOSTILE_FLOOR_NAMES.area);
      expect(overflow.text).toContain(formatVnd(NINE_DIGIT_BILL));
      expect(tableTiles).toBe(60);
    }
    if (name === "transfer-table") expect(overflow.text).toContain(HOSTILE_FLOOR_NAMES.area);
    expectOperationsText(name, overflow.text);
    if (["qr-payment-refused", "needs-attention"].includes(name)) {
      expect(overflow.text).toContain(vi.errors.SYNC_ORDER_HAS_SETTLED_QR);
    }
  });
});
