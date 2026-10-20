import type { PosPriceListWire } from "@fnb/contracts";
import { amountOf } from "./product-document";

type PriceListItemWire = PosPriceListWire["items"][number];

export interface PriceListItemRow {
  id: string;
  price_list_id: string;
  scope_kind: string;
  scope_id: string | null;
  branch_id: string | null;
  channel_key: string | null;
  valid_from: Date | null;
  valid_to: Date | null;
  days_of_week: number[] | null;
  start_minute: number | null;
  end_minute: number | null;
  effect_kind: string;
  fixed_price: string | null;
  percent_off_bp: number | null;
  rounding: string | null;
  priority: number;
}

type Rounding = Extract<PriceListItemWire["effect"], { kind: "percent_off" }>["rounding"];

/**
 * A stored item as a till reads it. The scope and effect columns are kept consistent by the
 * price list CHECK constraints (a scope id exactly when the kind needs one, a fixed price
 * or a rate and rounding by effect), so the fallbacks below are never taken.
 */
export function priceListItemWireOf(row: PriceListItemRow): PriceListItemWire {
  const scopeId = row.scope_id ?? "";
  return {
    id: row.id,
    scope:
      row.scope_kind === "variant"
        ? { kind: "variant", variantId: scopeId }
        : row.scope_kind === "product"
          ? { kind: "product", productId: scopeId }
          : row.scope_kind === "category"
            ? { kind: "category", categoryId: scopeId }
            : { kind: "global" },
    branchId: row.branch_id,
    channelKey: row.channel_key,
    validFrom: row.valid_from?.toISOString() ?? null,
    validTo: row.valid_to?.toISOString() ?? null,
    daysOfWeek: row.days_of_week,
    timeWindow:
      row.start_minute === null || row.end_minute === null
        ? null
        : { startMinute: row.start_minute, endMinute: row.end_minute },
    effect:
      row.effect_kind === "fixed_price"
        ? { kind: "fixed_price", price: amountOf(row.fixed_price ?? "0") }
        : {
            kind: "percent_off",
            rate: row.percent_off_bp ?? 0,
            rounding: (row.rounding ?? "half-up") as Rounding,
          },
    priority: row.priority,
  };
}
