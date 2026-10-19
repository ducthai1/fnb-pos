import { type LocalClockParts, type Quantity, QUANTITY_SCALE } from "@fnb/domain";
import type { Label, LabelLine } from "../label/lay-out-label";
import { PRINTING_ERROR_CODES } from "../printing-error-codes";
import { PrintingError } from "../printing-error";
import { formatTimeOfDay } from "./format-print-values";
import { PRINT_LABELS_VI as L } from "./print-labels-vi";

export interface CupItem {
  readonly name: string;
  /** Whole cups: one label each. */
  readonly quantity: Quantity;
  readonly size: string | null;
  readonly sugar: string | null;
  readonly ice: string | null;
  readonly toppings: readonly string[];
  readonly note: string | null;
}

export interface CupLabelInput {
  readonly callNumber: string;
  readonly printedAt: LocalClockParts;
  readonly items: readonly CupItem[];
}

function cupCount(item: CupItem): number {
  if (item.quantity <= 0n || item.quantity % QUANTITY_SCALE !== 0n) {
    throw new PrintingError(
      PRINTING_ERROR_CODES.invalidCupQuantity,
      `a cup label needs a whole, positive number of cups: ${item.quantity} thousandths`,
      { name: item.name, quantity: item.quantity },
    );
  }
  return Number(item.quantity / QUANTITY_SCALE);
}

function optionLine(label: string, value: string | null): LabelLine[] {
  return value === null ? [] : [{ text: `${label}: ${value}` }];
}

/**
 * One label per cup, numbered across the whole order ("2/5"), so the person handing drinks
 * over can tell when the order is complete. Two cups of one item get two identical labels
 * apart from that number.
 */
export function buildCupLabels(input: CupLabelInput): Label[] {
  const counts = input.items.map(cupCount);
  const total = counts.reduce((sum, n) => sum + n, 0);
  const time = formatTimeOfDay(input.printedAt);
  let index = 0;
  return input.items.flatMap((item, i) =>
    Array.from({ length: counts[i] ?? 0 }, (): Label => {
      index += 1;
      return [
        { text: `#${input.callNumber}`, large: true },
        { text: `${index}/${total} ${time}` },
        { text: item.name },
        ...optionLine(L.size, item.size),
        ...optionLine(L.sugar, item.sugar),
        ...optionLine(L.ice, item.ice),
        ...item.toppings.map((topping) => ({ text: `+ ${topping}` })),
        ...optionLine(L.note, item.note),
      ];
    }),
  );
}
