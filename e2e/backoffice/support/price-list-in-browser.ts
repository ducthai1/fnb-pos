import { vi as text } from "@fnb/backoffice/messages/vi";
import type { Locator, Page } from "playwright-core";

const T = text.priceLists.editor;
const exact = { exact: true } as const;

/** The editor's card for rule `n` (from 1), as the person sees it. */
export const ruleCard = (page: Page, n: number) => page.getByRole("listitem", { name: T.ruleTitle(n), exact: true });

/** Picks `option` in the app's own list box named `box`, inside `scope`. */
export async function choose(scope: Page | ReturnType<typeof ruleCard> | Locator, box: string, option: string | RegExp) {
  await scope.getByRole("combobox", { name: box, ...exact }).click();
  await scope.getByRole("option", typeof option === "string" ? { name: option, ...exact } : { name: option }).click();
}

/** Opens the page of a new price list from the list page and names it. */
export async function startPriceList(page: Page, name: string) {
  await page.getByRole("link", { name: text.priceLists.list.add }).click();
  await page.getByRole("heading", { name: T.newTitle }).waitFor();
  await page.getByLabel(T.nameLabel, exact).fill(name);
}
