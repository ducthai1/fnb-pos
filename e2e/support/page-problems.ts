import type { Page } from "playwright-core";

export interface PageProblem {
  readonly kind: "http" | "console" | "page_error";
  readonly url: string;
  readonly text: string;
}

/**
 * Every request answered 4xx/5xx, every console error (with the URL it is about) and every
 * uncaught error of the page and its Workers, so a spec fails on them and not only on what
 * the screen shows.
 */
export function watchPageProblems(page: Page): PageProblem[] {
  const problems: PageProblem[] = [];
  page.on("response", (response) => {
    if (response.status() >= 400) {
      problems.push({ kind: "http", url: response.url(), text: String(response.status()) });
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      problems.push({ kind: "console", url: message.location().url, text: message.text() });
    }
  });
  page.on("pageerror", (error) =>
    problems.push({ kind: "page_error", url: "", text: error.message }),
  );
  return problems;
}
