import { type Browser, type Page, chromium } from "playwright-core";

/** The machine's own Chrome: no browser download. CI images ship google-chrome there too. */
export const CHROME_PATH = process.env.FNB_CHROME_PATH ?? "/usr/bin/google-chrome";

export const launchSystemChrome = (): Promise<Browser> =>
  chromium.launch({ executablePath: CHROME_PATH, headless: true });

/**
 * Collects what a page logs as an error and every request answered with 4xx/5xx, so a
 * test can fail on them instead of only reading what the page wrote on screen.
 */
export function watchPage(page: Page): { problems: string[] } {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400) problems.push(`${response.status()} ${response.url()}`);
  });
  return { problems };
}
