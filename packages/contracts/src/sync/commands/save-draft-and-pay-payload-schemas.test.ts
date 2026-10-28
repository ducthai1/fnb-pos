import { describe, expect, it } from "vitest";
import { outcomeOf } from "../../zod-issue-test-helpers";
import { payOrderPayloadSchema } from "./pay-order-payload-schema";
import { saveDraftPayloadSchema } from "./save-draft-payload-schema";

const id = (n: number) => `0192f5a4-7c3e-7d10-8b2a-${String(n).padStart(12, "0")}`;

const lineIntent = {
  lineId: id(2),
  productId: id(3),
  variantId: null,
  modifiers: [{ groupId: id(4), optionId: id(5), quantity: 2 }],
  quantity: "1.5",
  note: null,
};
const draft = {
  orderId: id(1),
  deviceOrderNo: 7,
  serviceType: "takeaway",
  channelKey: null,
  lines: [lineIntent],
};

describe("saveDraftPayloadSchema", () => {
  it("keeps what the cashier chose and strips the price a till shows on screen", () => {
    const parsed = saveDraftPayloadSchema.parse({
      ...draft,
      lines: [{ ...lineIntent, unitPrice: 1 }],
    });
    expect(parsed.lines[0]).toEqual(lineIntent);
  });

  it("carries a typed price and an approval for products sold at an open price", () => {
    const parsed = saveDraftPayloadSchema.parse({
      ...draft,
      approvalId: id(9),
      lines: [{ ...lineIntent, enteredPrice: 15_000 }],
    });
    expect({ price: parsed.lines[0]?.enteredPrice, approval: parsed.approvalId }).toEqual({
      price: 15_000,
      approval: id(9),
    });
  });

  it("carries a line's own approval of its typed price", () => {
    const parsed = saveDraftPayloadSchema.parse({
      ...draft,
      lines: [{ ...lineIntent, enteredPrice: 150_000, priceApprovalId: id(8) }],
    });
    expect(parsed.lines[0]?.priceApprovalId).toBe(id(8));
  });

  it("carries a combo's picks, each with its own options and no price", () => {
    const tea = { slotId: id(6), productId: id(7), variantId: id(8), modifiers: [] };
    const parsed = saveDraftPayloadSchema.parse({
      ...draft,
      lines: [{ ...lineIntent, comboPicks: [{ ...tea, upcharge: 10_000 }] }],
    });
    expect(parsed.lines[0]?.comboPicks).toEqual([tea]);
  });

  it.each([
    [
      "a combo pick whose slot is not a uuid",
      {
        lines: [
          {
            ...lineIntent,
            comboPicks: [{ slotId: "drink", productId: id(7), variantId: null, modifiers: [] }],
          },
        ],
      },
    ],
    [
      "more combo picks than any combo has places",
      {
        lines: [
          {
            ...lineIntent,
            comboPicks: Array.from({ length: 31 }, () => ({
              slotId: id(6),
              productId: id(7),
              variantId: null,
              modifiers: [],
            })),
          },
        ],
      },
    ],
    ["a quantity with four decimals", { lines: [{ ...lineIntent, quantity: "1.2345" }] }],
    ["a quantity as a number", { lines: [{ ...lineIntent, quantity: 1 }] }],
    ["a typed price with đồng fractions", { lines: [{ ...lineIntent, enteredPrice: 1.5 }] }],
    ["an unknown service type", { serviceType: "drive_through" }],
    ["a device order number of zero", { deviceOrderNo: 0 }],
    ["an approval id that is not a uuid", { approvalId: "manager" }],
    [
      "a line's price approval that is not a uuid",
      { lines: [{ ...lineIntent, enteredPrice: 1, priceApprovalId: "manager" }] },
    ],
  ])("refuses %s", (_label, change) => {
    expect(outcomeOf(saveDraftPayloadSchema, { ...draft, ...change }).ok).toBe(false);
  });
});

describe("payOrderPayloadSchema", () => {
  const payment = { orderId: id(1), payments: [{ method: "cash", amount: 39_000 }] };

  it("accepts the payments and what the customer was asked for", () => {
    const parsed = payOrderPayloadSchema.parse({ ...payment, expectedAmountDue: 39_000 });
    expect(parsed).toEqual({ ...payment, expectedAmountDue: 39_000 });
  });

  it.each([
    ["a negative payment", [{ method: "cash", amount: -1 }]],
    ["a method the payment table would refuse", [{ method: "Cash", amount: 1 }]],
    ["no payment at all", []],
  ])("refuses %s", (_label, payments) => {
    const sent = { orderId: id(1), payments, expectedAmountDue: 1 };
    expect(outcomeOf(payOrderPayloadSchema, sent).ok).toBe(false);
  });
});
