import fc from "fast-check";
import {
  type BasisPoints,
  type Quantity,
  applyRate,
  basisPoints,
  multiplyVndByQuantity,
  quantity,
  quantityFromThousandths,
  vnd,
} from "../money";
import type { OrderLine, ServiceType } from "../order";
import { type OrderDiscount, buildOrderDiscountLines } from "./build-order-discount-lines";
import { computeOrderTotals } from "./compute-order-totals";
import type { OrderChargeProfile, OrderTotalsInput } from "./order-totals-types";
import { discountLine, itemLine, modifierLine } from "./totals-test-helpers";

export interface GeneratedOrder {
  readonly order: OrderTotalsInput;
  readonly profile: OrderChargeProfile;
  /** The order discount asked for and the root lines built for it (empty when none). */
  readonly orderDiscount: { readonly request: OrderDiscount; readonly built: OrderLine[] } | null;
  /** Net total before the order discount was added: the base a percent applies to. */
  readonly netBeforeOrderDiscount: bigint;
}

const SERVICE_TYPES: ServiceType[] = ["dine_in", "takeaway", "delivery_self", "delivery_platform"];
const RATES = [0, 500, 800, 1000].map(basisPoints);

const qty: fc.Arbitrary<Quantity> = fc.oneof(
  fc.integer({ min: 1, max: 5 }).map((units) => quantity(units)),
  fc.bigInt({ min: 1n, max: 5_000n }).map(quantityFromThousandths), // weighed items
);
const modifierSpec = fc.record({
  price: fc.integer({ min: 0, max: 30_000 }),
  qty: fc.integer({ min: 1, max: 3 }).map((units) => quantity(units)),
  rate: fc.nat(),
});
const itemSpec = fc.record({
  price: fc.integer({ min: 0, max: 500_000 }),
  qty,
  rate: fc.nat(),
  modifiers: fc.array(modifierSpec, { maxLength: 4 }),
  /** Share of the item's own unit price taken off by a discount under it. */
  lineDiscount: fc.option(fc.integer({ min: 1, max: 10_000 })),
});
const discountSpec = fc.oneof(
  fc.record({ kind: fc.constant("percent" as const), rate: fc.integer({ min: 1, max: 10_000 }) }),
  fc.record({
    kind: fc.constant("fixed" as const),
    shareOfNet: fc.integer({ min: 1, max: 10_000 }),
  }),
);
const serviceChargeSpec = fc.record({
  rate: fc.integer({ min: 0, max: 2_000 }).map(basisPoints),
  appliesTo: fc.subarray(SERVICE_TYPES),
  base: fc.constantFrom("before_discount" as const, "after_discount" as const),
  taxRate: fc.constantFrom(...RATES),
});

/** 1–15 items with 0–4 modifiers each over 1–3 tax rates, with or without each kind of charge. */
export const generatedOrder: fc.Arbitrary<GeneratedOrder> = fc
  .record({
    rates: fc.subarray(RATES, { minLength: 1, maxLength: 3 }),
    items: fc.array(itemSpec, { minLength: 1, maxLength: 15 }),
    discount: fc.option(discountSpec),
    serviceCharge: fc.option(serviceChargeSpec),
    serviceType: fc.constantFrom(...SERVICE_TYPES),
    pricesIncludeTax: fc.boolean(),
  })
  .map((spec) => {
    const rateAt = (i: number): BasisPoints => spec.rates[i % spec.rates.length] ?? basisPoints(0);
    const lines: OrderLine[] = [];
    spec.items.forEach((item, i) => {
      const id = `i${i}`;
      lines.push(itemLine(id, item.price, rateAt(item.rate), item.qty));
      item.modifiers.forEach((m, k) => {
        lines.push(modifierLine(`${id}m${k}`, id, m.price, rateAt(m.rate), m.qty));
      });
      if (item.lineDiscount !== null) {
        // per unit of the item and never above its own price, so it always fits the item
        const perUnit = applyRate(vnd(item.price), basisPoints(item.lineDiscount), "down");
        const total = multiplyVndByQuantity(perUnit, item.qty, "half-up");
        if (total > 0n) lines.push(discountLine(`${id}d`, id, Number(perUnit), rateAt(item.rate)));
      }
    });
    const profile = { pricesIncludeTax: spec.pricesIncludeTax, serviceCharge: spec.serviceCharge };
    const draft = { lines, serviceType: spec.serviceType };
    const netBefore = computeOrderTotals(draft, profile).netTotal;
    const request = toDiscount(spec.discount, netBefore);
    let n = 0;
    const built = request ? buildOrderDiscountLines(draft, request, () => `o${n++}`) : [];
    return {
      order: { lines: [...lines, ...built], serviceType: spec.serviceType },
      profile,
      orderDiscount: request ? { request, built } : null,
      netBeforeOrderDiscount: netBefore,
    };
  });

function toDiscount(
  spec: { kind: "percent"; rate: number } | { kind: "fixed"; shareOfNet: number } | null,
  net: bigint,
): OrderDiscount | null {
  if (spec === null) return null;
  if (spec.kind === "percent") return { kind: "percent", rate: basisPoints(spec.rate) };
  const amount = applyRate(vnd(net), basisPoints(spec.shareOfNet), "down");
  return amount > 0n ? { kind: "fixed", amount } : null;
}
