import { type OrderLine, type Vnd, addVnd, isDomainError } from "@fnb/domain";
import type { TillMenu } from "../menu/till-menu";
import { vi } from "../../messages/vi";
import type { CartLine, CounterOrder } from "./counter-order";
import {
  type KeptLines,
  type PricedCounterOrder,
  ProductGoneError,
  priceCounterOrder,
} from "./price-counter-order";

/** The cart as the screen shows it: priced by the domain, or why it cannot be. */
export type CartView = (
  | { readonly kind: "priced"; readonly priced: PricedCounterOrder }
  | { readonly kind: "unpriceable"; readonly message: string }
) & {
  readonly pricesIncludeTax: boolean;
  /** A line's name when the menu cannot price it any more. */
  nameOf(line: CartLine): string;
};

export function cartView(
  menu: TillMenu,
  order: CounterOrder,
  chargeProfile: Parameters<typeof priceCounterOrder>[2],
  at: number,
  kept?: KeptLines,
  commandLines?: readonly OrderLine[],
): CartView {
  const common = {
    pricesIncludeTax: chargeProfile.pricesIncludeTax,
    nameOf: (line: CartLine) => menu.productsById.get(line.productId)?.name ?? "",
  };
  try {
    return {
      ...common,
      kind: "priced",
      priced: priceCounterOrder(menu, order, chargeProfile, at, kept, commandLines),
    };
  } catch (error) {
    // The menu changed under the open order: a product gone, an option the shop removed.
    if (error instanceof ProductGoneError || isDomainError(error)) {
      return { ...common, kind: "unpriceable", message: vi.sale.productGone };
    }
    throw error;
  }
}

/** What one item costs with its options, as the domain priced each of those lines. */
export function lineAmountOf(priced: PricedCounterOrder, lineId: string): Vnd {
  const ids = new Set(
    priced.lines
      .filter((line) => line.id === lineId || line.parentLineId === lineId)
      .map((line) => line.id),
  );
  return addVnd(
    ...priced.totals.lines.filter((line) => ids.has(line.lineId)).map((line) => line.gross),
  );
}
