import { describe, expect, it } from "vitest";
import { percentRate, quantity, vnd } from "../money";
import { ORDER_ERROR_CODES, type Order, type RefundRequestLine } from "../order";
import { codeOf, line, order, reversal, sequentialIds } from "../order/order-line-test-fixtures";
import { buildOrderDiscountLines } from "./build-order-discount-lines";
import { buildRefund } from "./build-refund";
import {
  TAX_EXCLUSIVE,
  VAT_10,
  VAT_8,
  itemLine,
  modifierLine,
  withServiceCharge,
} from "./totals-test-helpers";
import { TOTALS_ERROR_CODES } from "./totals-error-codes";
import { paid, units } from "./totals-refund-test-helpers";
import { validateRefundAgainstSale } from "./validate-refund-against-sale";

// Three teas at 25.000 with pearls at 5.000 each (8%), a burger at 60.000 (10%), 10% off the
// order, 5% service charge, VAT on top: every amount of a refund is a share worth forging.
const profile = withServiceCharge(TAX_EXCLUSIVE);
const goods = [
  itemLine("tea", 25_000, VAT_8, quantity(3)),
  modifierLine("pearl", "tea", 5_000, VAT_8),
  itemLine("burger", 60_000, VAT_10),
];
const sale: Order = paid(
  order([
    ...goods,
    ...buildOrderDiscountLines(
      order(goods),
      { kind: "percent", rate: percentRate(10) },
      sequentialIds("off"),
    ),
  ]),
);
const refundOf = (request: RefundRequestLine[], existing: readonly Order[] = [], id = "r1") =>
  buildRefund(
    sale,
    request,
    existing,
    { orderId: id, newLineId: sequentialIds(id) },
    "2026-10-21",
    profile,
  ).order;
const check = (refund: Order, existing: readonly Order[] = []) =>
  codeOf(() => validateRefundAgainstSale(refund, sale, existing, profile));

/** The refund with line `id` replaced by `change(line)`. */
const withLine = (refund: Order, id: string, change: (l: Order["lines"][number]) => object) => ({
  ...refund,
  lines: refund.lines.map((l) => (l.id === id ? { ...l, ...change(l) } : l)),
});

describe("validateRefundAgainstSale accepts what buildRefund makes", () => {
  it("one tea with its pearls, then the rest, the earlier refund counted", () => {
    const first = refundOf([units("tea", 1)]);
    expect(check(first)).toBeUndefined();
    const second = refundOf([units("tea", 2), units("burger", 1)], [first], "r2");
    expect(check(second, [first])).toBeUndefined();
    // the server's list of the sale's refunds may already hold the one being checked
    expect(check(second, [first, second])).toBeUndefined();
  });
});

describe("validateRefundAgainstSale refuses a forged refund", () => {
  const refund = refundOf([units("tea", 1)]);
  const head = refund.lines[0]?.id ?? "";

  it("whose negative tea is priced at ten times what was sold", () => {
    const forged = withLine(refund, head, () => ({ unitPrice: vnd(250_000) }));
    expect(check(forged)).toBe(ORDER_ERROR_CODES.reversalMismatch);
  });

  it("with a 500.000 đ topping the sale never had hung under the negative tea", () => {
    const gold = { ...line("gold", "modifier", head), unitPrice: vnd(500_000) };
    expect(check({ ...refund, lines: [...refund.lines, gold] })).toBe(
      ORDER_ERROR_CODES.reversalMismatch,
    );
  });

  it("taking back 50 units of a line the sale does not have", () => {
    const ghost = { ...reversal("ghost-r", "ghost", quantity(-50)), unitPrice: vnd(9_999_999) };
    expect(check({ ...refund, lines: [ghost] })).toBe(ORDER_ERROR_CODES.reversedLineNotFound);
  });

  it("whose amounts were edited, removed or padded", () => {
    const amounts = refund.refundAmounts;
    if (amounts === null) throw new Error("buildRefund always sets the amounts");
    const [first, ...rest] = amounts.lines;
    if (first === undefined) throw new Error("the refund gives something back");
    const edits = [
      { ...amounts, lines: [{ ...first, gross: first.gross - 1n }, ...rest] },
      { ...amounts, lines: [{ ...first, tax: first.tax - 10_000n }, ...rest] },
      { ...amounts, lines: [...amounts.lines, first] },
      { ...amounts, pricesIncludeTax: true },
      null,
    ];
    for (const refundAmounts of edits) {
      expect(check({ ...refund, refundAmounts } as Order)).toBe(
        TOTALS_ERROR_CODES.refundAmountsMismatch,
      );
    }
  });

  it("that sells something, or moves the refund to another service type", () => {
    const extra = itemLine("free-cake", 0, VAT_8);
    expect(check({ ...refund, lines: [...refund.lines, extra] })).toBe(
      ORDER_ERROR_CODES.reversalMismatch,
    );
    expect(check({ ...refund, serviceType: "takeaway" })).toBe(ORDER_ERROR_CODES.reversalMismatch);
  });

  it("taking back more than is left after the earlier refunds", () => {
    const first = refundOf([units("tea", 3)]);
    const again = refundOf([units("tea", 1)], [], "r2");
    expect(check(again, [first])).toBe(ORDER_ERROR_CODES.refundExceedsRemaining);
  });

  it("of another sale", () => {
    expect(check({ ...refund, refundOfOrderId: "another" })).toBe(
      ORDER_ERROR_CODES.refundOfAnotherOrder,
    );
  });
});
