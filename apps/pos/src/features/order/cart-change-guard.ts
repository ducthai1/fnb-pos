import type { OrderLine } from "@fnb/domain";
import { hasOrderDiscount } from "./command-made-lines";
import type { CounterOrder } from "./counter-order";
import type { KeptLines } from "./price-counter-order";

/**
 * Whether a cart change is one the server takes: every held item exactly as it was (the
 * kitchen has it, or a discount or void points at it: changing it is a void), and, while a
 * discount is on the whole order, nothing already on it changed. That discount is a fixed
 * amount once given, so less on the order makes it a larger share of the bill, which the
 * server refuses past what the cashier may give alone; adding more is always fine.
 */
export function cartChangeAllowed(
  before: CounterOrder,
  after: CounterOrder,
  kept: KeptLines,
  commandLines: readonly OrderLine[],
): boolean {
  const unchanged = (lineId: string) => {
    const was = before.lines.find((line) => line.lineId === lineId);
    return was === undefined || after.lines.find((line) => line.lineId === lineId) === was;
  };
  if (![...kept.keys()].every(unchanged)) return false;
  return !hasOrderDiscount(commandLines) || before.lines.every((line) => unchanged(line.lineId));
}

/** Whether the cart may change `lineId` at all (stepper, remove), as cartChangeAllowed judges. */
export const lineHeld = (lineId: string, kept: KeptLines, commandLines: readonly OrderLine[]) =>
  kept.has(lineId) || hasOrderDiscount(commandLines);
