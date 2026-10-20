import { describe, expect, it } from "vitest";
import { outcomeOf, refusedPathsOf } from "../../zod-issue-test-helpers";
import { payOrderPayloadSchema } from "./pay-order-payload-schema";

const id = (n: number) => `0192f5a4-7c3e-7d10-8b2a-${String(n).padStart(12, "0")}`;
const pay = (payments: unknown[]) => ({ orderId: id(1), payments, expectedAmountDue: 49_000 });

describe("payOrderPayloadSchema with a QR transfer", () => {
  it("takes a QR transfer that names its intent, beside cash", () => {
    const sent = pay([
      { method: "qr_transfer", amount: 39_000, paymentIntentId: id(2) },
      { method: "cash", amount: 10_000 },
    ]);
    expect(payOrderPayloadSchema.parse(sent)).toEqual(sent);
  });

  it("refuses a QR transfer without its intent", () => {
    expect(
      refusedPathsOf(payOrderPayloadSchema, pay([{ method: "qr_transfer", amount: 1 }])),
    ).toEqual(["payments.0.paymentIntentId"]);
  });

  it("refuses an intent on money that did not come by QR transfer", () => {
    const cash = { method: "cash", amount: 39_000, paymentIntentId: id(2) };
    expect(refusedPathsOf(payOrderPayloadSchema, pay([cash]))).toEqual([
      "payments.0.paymentIntentId",
    ]);
  });

  it("refuses one intent counted twice in the same payment", () => {
    const half = { method: "qr_transfer", amount: 19_500, paymentIntentId: id(2) };
    expect(outcomeOf(payOrderPayloadSchema, pay([half, half])).ok).toBe(false);
    const other = { ...half, paymentIntentId: id(3) };
    expect(outcomeOf(payOrderPayloadSchema, pay([half, other])).ok).toBe(true);
  });
});
