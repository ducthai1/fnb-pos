import { describe, expect, it } from "vitest";
import { outcomeOf, refusedPathsOf } from "../zod-issue-test-helpers";
import { paymentAccountSettingSchema } from "./payment-account-schema";
import {
  cancelPaymentIntentPayloadSchema,
  createPaymentIntentPayloadSchema,
} from "./payment-intent-payload-schemas";
import { paymentIntentSnapshotSchema } from "./payment-intent-snapshot-schema";

const id = (n: number) => `0192f5a4-7c3e-7d10-8b2a-${String(n).padStart(12, "0")}`;
const intent = { intentId: id(1), orderId: id(2), amount: 39_000, contentCode: "FNB7K2M9QXA" };

describe("createPaymentIntentPayloadSchema", () => {
  it("takes the intent the till drew, with its amount and transfer code", () => {
    expect(createPaymentIntentPayloadSchema.parse(intent)).toEqual(intent);
  });

  it.each([
    ["an amount of nothing", { amount: 0 }, "amount"],
    ["a fractional amount", { amount: 39_000.5 }, "amount"],
    ["a code without the prefix", { contentCode: "ABC7K2M9QXA" }, "contentCode"],
    ["a code with a look-alike letter", { contentCode: "FNB7K2M9QXO" }, "contentCode"],
    ["a code one symbol short", { contentCode: "FNB7K2M9QX" }, "contentCode"],
    ["an intent id that is not a uuid", { intentId: "qr-1" }, "intentId"],
  ])("refuses %s", (_case, change, path) => {
    expect(refusedPathsOf(createPaymentIntentPayloadSchema, { ...intent, ...change })).toEqual([
      path,
    ]);
  });

  it("names the intent alone when taking it down", () => {
    expect(cancelPaymentIntentPayloadSchema.parse({ intentId: id(1) })).toEqual({
      intentId: id(1),
    });
    expect(outcomeOf(cancelPaymentIntentPayloadSchema, {}).ok).toBe(false);
  });
});

describe("paymentAccountSettingSchema", () => {
  const account = { bankBin: "970436", accountNumber: "0011001234567", accountName: "PHO SANG" };

  it("takes a bank account, or none", () => {
    expect(paymentAccountSettingSchema.parse(account)).toEqual(account);
    expect(paymentAccountSettingSchema.parse(null)).toBeNull();
  });

  it.each([
    ["a BIN of five digits", { bankBin: "97043" }],
    ["an account number with a dash", { accountNumber: "0011-001234567" }],
    ["a blank holder name", { accountName: "   " }],
    ["a field the till does not read", { branch: "Q1" }],
  ])("refuses %s", (_case, change) => {
    expect(outcomeOf(paymentAccountSettingSchema, { ...account, ...change }).ok).toBe(false);
  });
});

describe("paymentIntentSnapshotSchema", () => {
  const snapshot = {
    id: id(1),
    orderId: id(2),
    branchId: id(3),
    amount: 39_000,
    contentCode: "FNB7K2M9QXA",
    status: "partial",
    expiresAt: "2026-10-20T03:15:00.000Z",
    receivedAmount: 20_000,
    version: 2,
  };

  it("reads an intent as the feed sends it", () => {
    expect(paymentIntentSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });

  it("refuses a status the intents never take", () => {
    expect(
      refusedPathsOf(paymentIntentSnapshotSchema, { ...snapshot, status: "refunded" }),
    ).toEqual(["status"]);
  });
});
