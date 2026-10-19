import type { PriceListDocumentInput } from "@fnb/contracts";
import { type PriceListItem, basisPoints, validatePriceList, vnd } from "@fnb/domain";

const epochOf = (instant: string | null): number | null =>
  instant === null ? null : Date.parse(instant);

/** The items as the domain prices with them, checked by its rules; throws the domain's error. */
export function checkPriceListItems(input: PriceListDocumentInput): PriceListItem[] {
  const items = input.items.map((item): PriceListItem => ({
    id: item.id,
    scope: item.scope,
    branchId: item.branchId,
    channelKey: item.channelKey,
    validFrom: epochOf(item.validFrom),
    validTo: epochOf(item.validTo),
    daysOfWeek: item.daysOfWeek,
    timeWindow: item.timeWindow,
    effect:
      item.effect.kind === "fixed_price"
        ? { kind: "fixed_price", price: vnd(item.effect.price) }
        : {
            kind: "percent_off",
            rate: basisPoints(item.effect.rateBp),
            rounding: item.effect.rounding,
          },
    priority: item.priority,
  }));
  validatePriceList(items);
  return items;
}
