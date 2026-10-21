import type { PosProduct } from "@fnb/contracts";
import type { PricedCounterOrder } from "../features/order/price-counter-order";
import type { PrintedSlip } from "../features/printing/print-sale-slips";
import type { AdjustStep } from "./order-adjustment-flow";

/** Where a table's order is: the order itself, or one of the steps opened from it. */
export type TableOrderPhase =
  | { readonly kind: "order" | "transfer" | "leaving" }
  | { readonly kind: "picking"; readonly product: PosProduct }
  | { readonly kind: "adjusting"; readonly step: AdjustStep }
  | {
      readonly kind: "slips";
      readonly title: string;
      readonly slips: readonly PrintedSlip[] | null;
      readonly notice?: string;
    }
  | { readonly kind: "checkout"; readonly priced: PricedCounterOrder };
