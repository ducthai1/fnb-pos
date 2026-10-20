import { type OrderLine, subtreeOf } from "@fnb/domain";

/**
 * Lines only commands make: discounts, and cancel lines with their copies of the item's
 * options. A draft save never carries them and the server keeps them whatever a save sends,
 * so the till holds them beside the cart and adds them to every pricing of it.
 */
export function commandMadeLines(lines: readonly OrderLine[]): OrderLine[] {
  const ids = new Set<string>();
  for (const line of lines) {
    if (line.lineType === "discount") ids.add(line.id);
    if (line.reversesLineId !== null)
      for (const part of subtreeOf(lines, line.id)) ids.add(part.id);
  }
  return lines.filter((line) => ids.has(line.id));
}

/** Items a line discount or a cancel line points at: a save must carry them as they are. */
export function referencedItemIds(lines: readonly OrderLine[]): Set<string> {
  const ids = new Set<string>();
  for (const line of lines) {
    if (line.reversesLineId !== null) ids.add(line.reversesLineId);
    if (line.lineType === "discount" && line.parentLineId !== null) ids.add(line.parentLineId);
  }
  return ids;
}

/** Whether a discount on the whole order is on it: every item is then held as it is. */
export const hasOrderDiscount = (lines: readonly OrderLine[]) =>
  lines.some((line) => line.lineType === "discount" && line.parentLineId === null);

/** An item and its option lines (not its discounts), as a save would carry them. */
export const itemTree = (lines: readonly OrderLine[], itemId: string): OrderLine[] =>
  lines.filter(
    (line) =>
      line.id === itemId ||
      (line.parentLineId === itemId &&
        line.lineType !== "discount" &&
        line.reversesLineId === null),
  );
