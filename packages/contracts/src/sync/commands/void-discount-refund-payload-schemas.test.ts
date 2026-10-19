import { describe, expect, it } from "vitest";
import { domainCodesOf, outcomeOf } from "../../zod-issue-test-helpers";
import { applyDiscountPayloadSchema } from "./apply-discount-payload-schema";
import { cancelOrderPayloadSchema } from "./cancel-order-payload-schema";
import { refundOrderPayloadSchema } from "./refund-order-payload-schema";
import { removeDiscountPayloadSchema } from "./remove-discount-payload-schema";
import { voidLinePayloadSchema } from "./void-line-payload-schema";

const id = (n: number) => `0192f5a4-7c3e-7d10-8b2a-${String(n).padStart(12, "0")}`;

describe("voidLinePayloadSchema", () => {
  const voided = { orderId: id(1), lineId: id(2), quantity: "1.5", reasonCode: "wrong_item" };

  it("reads the quantity as the domain's thousandths", () => {
    expect(voidLinePayloadSchema.parse(voided).quantity).toBe(1_500n);
  });

  it.each([
    ["a reason in prose", { reasonCode: "khách đổi ý" }],
    ["an empty reason", { reasonCode: "" }],
    ["a quantity as a float", { quantity: 1.5 }],
  ])("refuses %s", (_label, change) => {
    expect(outcomeOf(voidLinePayloadSchema, { ...voided, ...change }).ok).toBe(false);
  });

  it("names the domain rule a quantity with four decimals breaks", () => {
    const sent = { ...voided, quantity: "1.2345" };
    expect(domainCodesOf(voidLinePayloadSchema, sent)).toEqual([
      "DOMAIN_MONEY_QUANTITY_TOO_PRECISE",
    ]);
  });
});

describe("applyDiscountPayloadSchema", () => {
  const base = { orderId: id(1), discountLineIds: [id(5)] };

  it.each([
    [{ scope: "order", discount: { kind: "percent", rate: 1_000 } }],
    [{ scope: "order", discount: { kind: "fixed", amount: 10_000 } }],
    [{ scope: "line", lineId: id(2), discount: { kind: "fixed_for_line", amount: 5_000 } }],
  ])("accepts %j", (discount) => {
    expect(outcomeOf(applyDiscountPayloadSchema, { ...base, ...discount }).ok).toBe(true);
  });

  it.each([
    [
      "a fixed amount for one line on the order",
      { scope: "order", discount: { kind: "fixed_for_line", amount: 1 } },
    ],
    [
      "an order-wide amount on one line",
      { scope: "line", lineId: id(2), discount: { kind: "fixed", amount: 1 } },
    ],
    ["a line discount without its line", { scope: "line", discount: { kind: "percent", rate: 1 } }],
    [
      "no ids for the lines",
      { scope: "order", discountLineIds: [], discount: { kind: "percent", rate: 1 } },
    ],
  ])("refuses %s", (_label, change) => {
    expect(outcomeOf(applyDiscountPayloadSchema, { ...base, ...change }).ok).toBe(false);
  });

  it("names the domain rule a rate above 100% breaks", () => {
    const sent = { ...base, scope: "order", discount: { kind: "percent", rate: 10_001 } };
    expect(domainCodesOf(applyDiscountPayloadSchema, sent)).toEqual(["DOMAIN_MONEY_INVALID_RATE"]);
  });
});

describe("removeDiscountPayloadSchema and cancelOrderPayloadSchema", () => {
  it("accept the lines to remove and the reason to cancel", () => {
    const removal = { orderId: id(1), discountLineIds: [id(2)] };
    expect(removeDiscountPayloadSchema.parse(removal)).toEqual(removal);
    const cancel = { orderId: id(1), reasonCode: "customer_left" };
    expect(cancelOrderPayloadSchema.parse(cancel)).toEqual(cancel);
  });

  it("refuse removing nothing and cancelling without a reason", () => {
    expect(outcomeOf(removeDiscountPayloadSchema, { orderId: id(1), discountLineIds: [] }).ok).toBe(
      false,
    );
    expect(outcomeOf(cancelOrderPayloadSchema, { orderId: id(1) }).ok).toBe(false);
  });
});

describe("refundOrderPayloadSchema", () => {
  const refund = {
    refundOrderId: id(1),
    saleOrderId: id(2),
    deviceOrderNo: 12,
    lines: [{ lineId: id(3), quantity: "1", restock: false }],
    reasonCode: "spilt_drink",
    payouts: [{ method: "cash", amount: -29_000 }],
  };

  it("accepts payouts as the refund's own negative payments", () => {
    expect(refundOrderPayloadSchema.parse(refund).payouts).toEqual(refund.payouts);
  });

  it.each([
    ["a payout taking money in", { payouts: [{ method: "cash", amount: 1 }] }],
    ["no payout", { payouts: [] }],
    ["no line", { lines: [] }],
    ["a line without its restock choice", { lines: [{ lineId: id(3), quantity: "1" }] }],
  ])("refuses %s", (_label, change) => {
    expect(outcomeOf(refundOrderPayloadSchema, { ...refund, ...change }).ok).toBe(false);
  });
});
