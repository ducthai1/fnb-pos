import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { quantityFromThousandths, subtractQuantity, vnd } from "../money";
import {
  ORDER_ERROR_CODES,
  type Order,
  type OrderLine,
  subtreeOf,
  validateLineTree,
} from "../order";
import { codeOf, order, sequentialIds } from "../order/order-line-test-fixtures";
import { buildRefund } from "./build-refund";
import { applyVoids, voidStep } from "./order-lifecycle-arbitraries";
import { generatedOrderOf } from "./order-totals-arbitraries";
import type { OrderChargeProfile } from "./order-totals-types";
import { TOTALS_ERROR_CODES } from "./totals-error-codes";
import { paid } from "./totals-refund-test-helpers";
import { validateRefundAgainstSale } from "./validate-refund-against-sale";

const RUNS = { numRuns: 500 };

/** Every way of changing one compared field of a copied line; each yields a different value. */
const FORGERIES: ((l: OrderLine) => OrderLine)[] = [
  (l) => ({ ...l, unitPrice: vnd(l.unitPrice - 1n) }),
  (l) => ({ ...l, productId: `${l.productId ?? ""}-forged` }),
  (l) => ({ ...l, variantId: `${l.variantId ?? ""}-forged` }),
  (l) => ({ ...l, taxRate: ((l.taxRate + 1) % 10_001) as OrderLine["taxRate"] }),
  (l) => ({ ...l, priceSource: l.priceSource === "manual" ? "promotion" : "manual" }),
];
const CHILD_FORGERIES: ((l: OrderLine) => OrderLine)[] = [
  ...FORGERIES,
  (l) => ({ ...l, modifierOptionId: `${l.modifierOptionId ?? ""}-forged` }),
  (l) => ({ ...l, quantity: quantityFromThousandths(l.quantity + 1n) }),
];
const forgery = fc.record({ line: fc.nat(), how: fc.nat() });

const voidedDraft = fc
  .record({ g: generatedOrderOf(5), voids: fc.array(voidStep, { minLength: 1, maxLength: 3 }) })
  .map(({ g, voids }) =>
    applyVoids(order(g.order.lines, { serviceType: g.order.serviceType }), voids),
  );

describe("lines made by voidLine and buildRefund pass; one forged field never does", () => {
  it("a void line copies its item, and changing any compared field of any copy is refused", () => {
    fc.assert(
      fc.property(voidedDraft, forgery, (draft, pick) => {
        expect(codeOf(() => validateLineTree(draft.lines))).toBeUndefined();
        const copies = draft.lines
          .filter((l) => l.reversesLineId !== null)
          .flatMap((head) => subtreeOf(draft.lines, head.id));
        const target = copies[pick.line % copies.length];
        if (!target) return;
        const ways = target.reversesLineId === null ? CHILD_FORGERIES : FORGERIES;
        const forge = ways[pick.how % ways.length] ?? ((l: OrderLine) => l);
        const lines = draft.lines.map((l) => (l.id === target.id ? forge(l) : l));
        expect(codeOf(() => validateLineTree(lines))).toBe(ORDER_ERROR_CODES.reversalMismatch);
      }),
      RUNS,
    );
  });

  it("a refund built in steps validates against the sale, and a đồng moved never does", () => {
    const steps = fc.array(
      fc.record({ item: fc.nat(), share: fc.bigInt({ min: 1n, max: 1_000n }) }),
      {
        minLength: 1,
        maxLength: 4,
      },
    );
    fc.assert(
      fc.property(generatedOrderOf(5), steps, forgery, ({ order: o, profile }, plan, pick) => {
        const sale = paid(order(o.lines, { serviceType: o.serviceType }));
        const refunds = refundsInSteps(sale, profile, plan);
        refunds.forEach((refund, k) => {
          const earlier = refunds.slice(0, k);
          expect(validateRefundAgainstSale(refund, sale, earlier, profile)).toBeUndefined();
        });
        const last = refunds.at(-1);
        const amounts = last?.refundAmounts;
        if (!last || !amounts) return;
        const fields = ["gross", "discountAllocated", "tax", "serviceCharge", "serviceChargeTax"];
        const field = fields[pick.how % fields.length] ?? "gross";
        const at = pick.line % amounts.lines.length;
        const moved = amounts.lines.map((a, i) =>
          i === at ? { ...a, [field]: (a[field as "gross"] as bigint) - 1n } : a,
        );
        const forged = { ...last, refundAmounts: { ...amounts, lines: moved } };
        const code = codeOf(() =>
          validateRefundAgainstSale(forged, sale, refunds.slice(0, -1), profile),
        );
        expect(code).toBe(TOTALS_ERROR_CODES.refundAmountsMismatch);
      }),
      RUNS,
    );
  });
});

/** Each step refunds part of what is left of one item, as a till would. */
function refundsInSteps(
  sale: Order,
  profile: OrderChargeProfile,
  plan: readonly { item: number; share: bigint }[],
): Order[] {
  const left = new Map(
    sale.lines.filter((l) => l.lineType === "item").map((l) => [l.id, l.quantity]),
  );
  const refunds: Order[] = [];
  for (const step of plan) {
    const open = [...left].filter(([, q]) => q > 0n);
    const [lineId, q] = open[step.item % Math.max(open.length, 1)] ?? [];
    if (lineId === undefined || q === undefined) break;
    const quantity = quantityFromThousandths(1n + ((q - 1n) * step.share) / 1_000n);
    const id = `r${refunds.length}`;
    const ids = { orderId: id, newLineId: sequentialIds(id) };
    const request = [{ lineId, quantity, restock: true }];
    refunds.push(buildRefund(sale, request, refunds, ids, "2026-10-21", profile).order);
    left.set(lineId, subtractQuantity(q, quantity));
  }
  return refunds;
}
