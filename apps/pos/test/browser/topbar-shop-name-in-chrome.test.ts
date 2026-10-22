import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { vi } from "../../src/messages/vi";

let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

const SHORT_NAME = "Cà phê Mẫu";
/** Sixty letters with nowhere to wrap: the name has to give way, the bar must not. */
const LONG_NAME = "CàPhêSữaĐáSàiGònQuậnBìnhThạnh".repeat(3).slice(0, 60);

interface BarLook {
  name: { scroll: number; client: number };
  bar: { scroll: number; client: number; right: number };
  /** How far any part of the bar reaches past the bar's right edge, in px. */
  sticksOut: number;
  /** The pill's sentence: its drawn width (1px when only read out) and what it says. */
  syncPill: { wordsWidth: number; width: number; label: string; drawnCount: string };
}

async function openBar(page: Page, brand: string, pending = 0): Promise<BarLook> {
  await page.goto(`${inject("screensOrigin")}/screens.html?bar=${encodeURIComponent(brand)}&pending=${pending}`);
  await page.waitForFunction(`document.body.dataset.screenReady === "bar"`);
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>(".pos-topbar")!;
    const name = bar.querySelector<HTMLElement>(".pos-topbar__brand")!;
    const pill = bar.querySelector<HTMLElement>(".pos-badge[data-pending]")!;
    const edge = bar.getBoundingClientRect().right;
    const reach = Math.max(
      ...[...bar.querySelectorAll<HTMLElement>("*")]
        .filter((element) => getComputedStyle(element).position !== "absolute")
        .map((element) => element.getBoundingClientRect().right),
    );
    return {
      name: { scroll: name.scrollWidth, client: name.clientWidth },
      bar: { scroll: bar.scrollWidth, client: bar.clientWidth, right: edge },
      sticksOut: Math.max(0, reach - edge),
      syncPill: {
        wordsWidth: pill.querySelector(".pos-badge__words")!.getBoundingClientRect().width,
        width: pill.getBoundingClientRect().width,
        label: pill.textContent ?? "",
        drawnCount: getComputedStyle(pill, "::after").content,
      },
    };
  });
}

describe.each([1280, 1440])("the till's bar at %ipx", (width) => {
  it(`shows "${SHORT_NAME}" whole`, async () => {
    const page = await browser!.newPage({ viewport: { width, height: 800 } });
    const look = await openBar(page, SHORT_NAME);
    await page.close();
    expect(look.name.client).toBeGreaterThan(0);
    expect(look.name.scroll).toBeLessThanOrEqual(look.name.client);
    expect(look.bar.scroll).toBeLessThanOrEqual(look.bar.client);
    expect(look.syncPill.label).toContain(vi.sync.allSynced);
  });

  it("cuts a 60-letter name with an ellipsis and keeps the bar within the screen", async () => {
    const page = await browser!.newPage({ viewport: { width, height: 800 } });
    const look = await openBar(page, LONG_NAME);
    await page.close();
    expect(look.name.scroll).toBeGreaterThan(look.name.client);
    expect(look.bar.scroll).toBeLessThanOrEqual(look.bar.client);
    expect(look.sticksOut).toBeLessThanOrEqual(1);
    expect(look.bar.right).toBeLessThanOrEqual(width + 1);
  });
});

describe("the sync pill on the bar", () => {
  it("shows only its icon below 1440px, still named for screen readers", async () => {
    const page = await browser!.newPage({ viewport: { width: 1280, height: 800 } });
    const look = await openBar(page, SHORT_NAME);
    await page.close();
    expect(look.syncPill.wordsWidth).toBeLessThanOrEqual(1);
    expect(look.syncPill.width).toBeLessThanOrEqual(48);
    expect(look.syncPill.label).toContain(vi.sync.allSynced);
  });

  it("shows its cloud and the count of waiting commands below 1440px, the sentence still read out", async () => {
    const page = await browser!.newPage({ viewport: { width: 1280, height: 800 } });
    const look = await openBar(page, SHORT_NAME, 37);
    await page.close();
    expect(look.syncPill.wordsWidth).toBeLessThanOrEqual(1);
    expect(look.syncPill.drawnCount).toContain('"37"');
    expect(look.syncPill.label).toBe(vi.sync.pending(37));
    expect(look.name.scroll).toBeLessThanOrEqual(look.name.client);
  });

  it("shows its words from 1440px", async () => {
    const page = await browser!.newPage({ viewport: { width: 1440, height: 800 } });
    const look = await openBar(page, SHORT_NAME);
    await page.close();
    expect(look.syncPill.wordsWidth).toBeGreaterThan(40);
    expect(look.syncPill.label).toBe(vi.sync.allSynced);
  });
});
