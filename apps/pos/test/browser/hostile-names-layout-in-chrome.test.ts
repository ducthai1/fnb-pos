import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { HOSTILE_MENU_NAMES } from "../../src/test-support/hostile-menu";
import { HOSTILE_NAMES } from "../../src/test-support/hostile-names";
import { vi } from "../../src/messages/vi";
import { HOSTILE_INVOICE } from "./pages/hostile-sale";
import { SCREEN_NAMES } from "./pages/screen-names";
import { measureScreenOverflow } from "./support/measure-screen-overflow";

let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

describe.each([360, 800])("the POS screens at %ipx wide with hostile names", (width) => {
  it.each(SCREEN_NAMES)("%s stays within the screen", async (name) => {
    const page = await browser!.newPage({ viewport: { width, height: 640 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${inject("screensOrigin")}/screens.html?screen=${name}`);
    await page.waitForFunction(`document.body.dataset.screenReady === "${name}"`);
    const overflow = await measureScreenOverflow(page);
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
    if (["sale", "modifier-picker"].includes(name)) {
      expect(overflow.text).toContain(HOSTILE_MENU_NAMES.product);
    }
    if (name === "qr-payment") expect(overflow.text).toContain(HOSTILE_NAMES.staff);
    if (name === "payment") expect(overflow.text).toContain(HOSTILE_NAMES.branch);
    if (name === "sale-done-invoice") expect(overflow.text).toContain(HOSTILE_INVOICE.lookupCode);
    if (name === "buyer-info") expect(buyerName).toContain(HOSTILE_NAMES.staff);
    if (["qr-payment-refused", "needs-attention"].includes(name)) {
      expect(overflow.text).toContain(vi.errors.SYNC_ORDER_HAS_SETTLED_QR);
    }
  });
});
