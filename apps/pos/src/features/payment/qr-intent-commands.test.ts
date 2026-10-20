import {
  PAYMENT_INTENT_ENTITY,
  createPaymentIntentPayloadSchema,
  paymentIntentSnapshotSchema,
  payOrderPayloadSchema,
} from "@fnb/contracts";
import { vnd } from "@fnb/domain";
import { parseVietQrPayload } from "@fnb/domain/payment";
import { describe, expect, it } from "vitest";
import { PLACE, SALE_MENU } from "../../test-support/paid-sale-fixture";
import { paymentAccountOf } from "./payment-account";
import { QR_LIFETIME_ESTIMATE_MS, cancelQrCommand, drawQr } from "./qr-intent-commands";
import { closeWithSettledQrCommand, readIntentSnapshot } from "./settled-qr";

const ACCOUNT = { bankBin: "970436", accountNumber: "0011001234567", accountName: "PHO SANG" };
const AT = Date.parse("2026-10-20T03:00:00.000Z");
const ORDER = { orderId: "0199f000-0000-7000-8000-00000000c001", amountDue: vnd(129_000) };
const fixedBytes = (bytes: Uint8Array) => bytes.map((_, index) => index * 3);

describe("drawing a VietQR on the till", () => {
  it("encodes the order's amount and the code into the shop's account, and registers it", () => {
    const drawn = drawQr(PLACE, ACCOUNT, ORDER, AT, fixedBytes);
    expect(drawn.contentCode).toBe("FNB0369CFJN");
    expect(parseVietQrPayload(drawn.payload)).toMatchObject({
      initiation: "dynamic",
      bankBin: "970436",
      accountNumber: "0011001234567",
      amount: vnd(129_000),
      content: "FNB0369CFJN",
    });
    const { command } = drawn;
    expect(command.type).toBe("payment.create_intent");
    expect(createPaymentIntentPayloadSchema.parse(command.payload)).toEqual({
      intentId: drawn.intentId,
      orderId: ORDER.orderId,
      amount: 129_000,
      contentCode: "FNB0369CFJN",
    });
    expect(command.target.entity).toBe(PAYMENT_INTENT_ENTITY);
    const optimistic = paymentIntentSnapshotSchema.parse(command.target.optimistic);
    expect(optimistic).toMatchObject({ status: "pending", receivedAmount: null });
    expect(Date.parse(optimistic.expiresAt)).toBe(AT + QR_LIFETIME_ESTIMATE_MS);
  });

  it("draws a fresh id and code each time from the machine's randomness", () => {
    const a = drawQr(PLACE, ACCOUNT, ORDER, AT);
    const b = drawQr(PLACE, ACCOUNT, ORDER, AT);
    expect(a.intentId).not.toBe(b.intentId);
    expect(a.contentCode).not.toBe(b.contentCode);
  });

  it("refuses to draw a QR for nothing: a bank app would ask the customer for any amount", () => {
    expect(() => drawQr(PLACE, ACCOUNT, { ...ORDER, amountDue: vnd(0) }, AT)).toThrow();
  });

  it("takes a QR down by its id, expecting it withdrawn at the next version", () => {
    const intent = readIntentSnapshot(drawQr(PLACE, ACCOUNT, ORDER, AT).command.target.optimistic);
    const command = cancelQrCommand(PLACE, intent!, AT);
    expect(command.payload).toEqual({ intentId: intent!.id });
    expect(command.target.optimistic).toMatchObject({ status: "cancelled", version: 2 });
  });

  it("closes an order with a paid QR in a payment the order.pay contract takes", () => {
    const paid = {
      ...readIntentSnapshot(drawQr(PLACE, ACCOUNT, ORDER, AT).command.target.optimistic)!,
    };
    const order = { id: ORDER.orderId, status: "draft", version: 4 };
    const command = closeWithSettledQrCommand(PLACE, order, { ...paid, status: "paid" }, null, AT);
    expect(payOrderPayloadSchema.parse(command.payload)).toEqual({
      orderId: ORDER.orderId,
      payments: [{ method: "qr_transfer", amount: 129_000, paymentIntentId: paid.id }],
      expectedAmountDue: 129_000,
    });
    expect(command.target.optimistic).toMatchObject({ status: "paid", version: 5 });
  });
});

describe("the branch's account for QRs", () => {
  const config = (settings: Record<string, unknown>) => ({ ...SALE_MENU.config, settings });

  it("is read from the payment_account setting", () => {
    expect(paymentAccountOf(config({ payment_account: ACCOUNT }))).toEqual(ACCOUNT);
  });

  it("is none when the branch set none, or set one no QR can name", () => {
    expect(paymentAccountOf(config({}))).toBeNull();
    expect(paymentAccountOf(config({ payment_account: null }))).toBeNull();
    expect(
      paymentAccountOf(config({ payment_account: { ...ACCOUNT, bankBin: "97043" } })),
    ).toBeNull();
  });
});
