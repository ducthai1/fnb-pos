import { writeFile } from "node:fs/promises";
import type { Page } from "playwright-core";

/** The handbook keeps each picture at or under this size, so the repo stays light. */
export const MAX_SHOT_BYTES = 150 * 1024;
const QUALITIES = [82, 74, 66, 58, 50, 42, 34];

/**
 * Fails when the page is drawn dark: this machine's headless Chrome asks for a dark scheme,
 * and the handbook shows the app as a shop sees it, in light.
 */
export async function expectLightPage(page: Page, name: string): Promise<void> {
  const { dark, background } = await page.evaluate(() => ({
    dark: window.matchMedia("(prefers-color-scheme: dark)").matches,
    background: getComputedStyle(document.body).backgroundColor,
  }));
  const channels = (background.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
  const lightness = channels.length === 3 ? channels.reduce((sum, value) => sum + value, 0) / 3 : 0;
  if (dark || lightness < 200)
    throw new Error(`${name}: drawn dark (scheme dark ${dark}, body ${background})`);
}

/**
 * The visible part of the page as WebP, written to `file`, at the best quality that fits
 * under MAX_SHOT_BYTES. Through the DevTools protocol: playwright saves only PNG and JPEG.
 */
export async function saveWebpShot(page: Page, file: string): Promise<number> {
  const session = await page.context().newCDPSession(page);
  try {
    for (const quality of QUALITIES) {
      const { data } = (await session.send("Page.captureScreenshot", {
        format: "webp",
        quality,
      })) as { data: string };
      const bytes = Buffer.from(data, "base64");
      if (bytes.length <= MAX_SHOT_BYTES) {
        await writeFile(file, bytes);
        return bytes.length;
      }
    }
    throw new Error(`${file}: still over ${MAX_SHOT_BYTES} bytes at quality ${QUALITIES.at(-1)}`);
  } finally {
    await session.detach();
  }
}
