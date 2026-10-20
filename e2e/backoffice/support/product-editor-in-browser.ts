import { vi as text } from "@fnb/backoffice/messages/vi";
import type { Locator, Page } from "playwright-core";

const T = text.menu.editor;
const exact = { exact: true } as const;

export interface OptionInput {
  name: string;
  priceDelta?: string;
  maxQuantity?: string;
}

export interface GroupInput {
  name: string;
  minSelect: string;
  maxSelect: string;
  allowDuplicates?: boolean;
  options: readonly OptionInput[];
}

/** The editor's group card `n` (from 1), as the person sees it. */
export const groupCard = (page: Page, n: number) => page.getByRole("region", { name: T.groupLabel(n) });

async function fill(scope: Locator, label: string, value: string) {
  await scope.getByLabel(label, exact).fill(value);
}

/** Adds a size with its own price (blank: the product's price). */
export async function addSize(page: Page, n: number, name: string, price = "") {
  await page.getByRole("button", { name: T.addVariant }).click();
  const size = page.getByRole("group", { name: T.variantLabel(n), exact: true });
  await fill(size, T.variantName, name);
  if (price !== "") await fill(size, T.variantPrice, price);
}

/** Adds group `n` and types it in field by field, options in order. */
export async function addGroup(page: Page, n: number, group: GroupInput) {
  await page.getByRole("button", { name: T.addGroup }).click();
  const card = groupCard(page, n);
  await fill(card, T.groupName, group.name);
  await fill(card, T.minSelect, group.minSelect);
  await fill(card, T.maxSelect, group.maxSelect);
  if (group.allowDuplicates === true) await card.getByRole("checkbox", { name: T.allowDuplicates }).check();
  for (const [index, option] of group.options.entries()) {
    await card.getByRole("button", { name: T.addOption }).click();
    const row = card.getByRole("group", { name: T.optionLabel(index + 1), exact: true });
    await fill(row, T.optionName, option.name);
    if (option.priceDelta !== undefined) await fill(row, T.priceDelta, option.priceDelta);
    if (option.maxQuantity !== undefined) await fill(row, T.maxQuantity, option.maxQuantity);
  }
}

/** The preview panel, where the person picks as a customer would. */
export const preview = (page: Page) => page.getByRole("region", { name: text.menu.preview.title });

/** Taps "+" on an option of the preview `times` times. */
export async function addInPreview(page: Page, option: string, times: number) {
  const more = preview(page).getByRole("button", { name: text.menu.preview.more(option), exact: true });
  for (let i = 0; i < times; i++) await more.click();
}
