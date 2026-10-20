import { type Vnd, ZERO_VND, addVnd, compareVnd, subtractVnd, vnd } from "@fnb/domain";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  MAX_TENDERS,
  PAYMENT_METHODS,
  type Tender,
  paymentsToSend,
  refuseTender,
  settleTenders,
} from "./tenders";

const cash = (amount: number): Tender => ({ method: PAYMENT_METHODS.cash, amount: vnd(amount) });
const INTENT = "0199f000-0000-7000-8000-00000000a001";
const qr = (amount: number): Tender => ({
  method: PAYMENT_METHODS.qrTransfer,
  amount: vnd(amount),
  paymentIntentId: INTENT,
});
const DUE = vnd(129_000);

describe("settling what the customer handed over", () => {
  it("applies 129.000 of a 200.000 note and gives 71.000 back", () => {
    const settled = settleTenders(DUE, [cash(200_000)]);
    expect(settled).toEqual({
      payments: [{ method: "cash", amount: vnd(129_000) }],
      remaining: ZERO_VND,
      change: vnd(71_000),
    });
    expect(paymentsToSend(DUE, settled)).toEqual([{ method: "cash", amount: vnd(129_000) }]);
  });

  it("takes part by transfer and the rest in cash, with change on the cash only", () => {
    const settled = settleTenders(DUE, [qr(100_000), cash(50_000)]);
    expect(settled.payments).toEqual([
      { method: "qr_transfer", amount: vnd(100_000), paymentIntentId: INTENT },
      { method: "cash", amount: vnd(29_000) },
    ]);
    expect(settled.change).toBe(vnd(21_000));
  });

  it("sends nothing while money is still owed", () => {
    const settled = settleTenders(DUE, [cash(100_000)]);
    expect(settled.remaining).toBe(vnd(29_000));
    expect(paymentsToSend(DUE, settled)).toBeNull();
  });

  it("pays an order of 0đ with one zero cash payment, which order.pay requires", () => {
    expect(paymentsToSend(ZERO_VND, settleTenders(ZERO_VND, []))).toEqual([
      { method: "cash", amount: ZERO_VND },
    ]);
  });
});

describe("refusing a tender", () => {
  it("refuses a transfer for more than is owed, and takes one for exactly what is owed", () => {
    expect(refuseTender(DUE, [], qr(130_000))).toBe("transfer_over_remaining");
    expect(refuseTender(DUE, [], qr(129_000))).toBeNull();
    expect(refuseTender(DUE, [], cash(500_000))).toBeNull();
  });

  it("refuses a transfer that names no QR the bank paid, and takes one that does", () => {
    const confirmedByHand: Tender = { method: PAYMENT_METHODS.qrTransfer, amount: DUE };
    expect(refuseTender(DUE, [], confirmedByHand)).toBe("transfer_without_qr");
    expect(refuseTender(DUE, [], qr(129_000))).toBeNull();
  });

  it("refuses nothing or less, anything once covered, and an eleventh tender", () => {
    expect(refuseTender(DUE, [], cash(0))).toBe("not_positive");
    expect(refuseTender(DUE, [cash(200_000)], cash(1_000))).toBe("nothing_left");
    const ten = Array.from({ length: MAX_TENDERS }, () => cash(1_000));
    expect(refuseTender(DUE, ten, cash(1_000))).toBe("too_many");
    expect(refuseTender(DUE, ten.slice(1), cash(1_000))).toBeNull();
  });
});

describe("settlement invariants", () => {
  const amount = fc.integer({ min: 0, max: 50_000_000 }).map((n): Vnd => vnd(n));
  const tender = fc.record({
    method: fc.constantFrom(PAYMENT_METHODS.cash, PAYMENT_METHODS.qrTransfer),
    amount: fc.integer({ min: 1, max: 50_000_000 }).map((n): Vnd => vnd(n)),
    paymentIntentId: fc.constant(INTENT),
  });

  it("never pays more than is due, never goes below zero, and hands back only the excess", () => {
    fc.assert(
      fc.property(amount, fc.array(tender, { maxLength: 10 }), (due, tenders) => {
        const settled = settleTenders(due, tenders);
        const applied = addVnd(ZERO_VND, ...settled.payments.map((payment) => payment.amount));
        const handed = addVnd(ZERO_VND, ...tenders.map((t) => t.amount));
        expect(addVnd(applied, settled.remaining)).toBe(due);
        expect(compareVnd(settled.remaining, ZERO_VND)).toBeGreaterThanOrEqual(0);
        expect(addVnd(applied, settled.change)).toBe(handed);
        if (compareVnd(handed, due) >= 0) expect(settled.remaining).toBe(ZERO_VND);
        else expect(settled.remaining).toBe(subtractVnd(due, handed));
      }),
    );
  });
});
