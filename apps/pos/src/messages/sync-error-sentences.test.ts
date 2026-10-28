import { PRICING_ERROR_CODES } from "@fnb/domain";
import { PAYMENT_ERROR_CODES } from "@fnb/domain/payment";
import { describe, expect, it } from "vitest";
// The server's own lists, so a code added there without a sentence here fails this test.
import { EINVOICE_ERROR_CODES } from "../../../api/src/einvoice/einvoice-error-codes";
import { PAYMENT_SYNC_ERROR_CODES } from "../../../api/src/payments/payment-error-codes";
import { SHIFT_SYNC_ERROR_CODES } from "../../../api/src/sync/shift-sync-error-codes";
import { messageForCode, vi } from "./vi";

const SYNC_CODES = [
  ...Object.values(PAYMENT_SYNC_ERROR_CODES),
  ...Object.values(SHIFT_SYNC_ERROR_CODES),
  ...Object.values(EINVOICE_ERROR_CODES).filter((code) => code.startsWith("SYNC_")),
  PAYMENT_ERROR_CODES.invalidIntentTransition,
];

describe("what the till says when the server refuses a payment, shift or invoice command", () => {
  it.each(SYNC_CODES)("says what %s means in its own sentence", (code) => {
    expect(messageForCode(code)).not.toBe(vi.errors.unknown);
  });

  it("gives each of those codes a different sentence", () => {
    const sentences = SYNC_CODES.map(messageForCode);
    expect(new Set(sentences).size).toBe(sentences.length);
  });

  // A draft with a typed price or a weight the server refused: the cashier must know which.
  it.each([
    PRICING_ERROR_CODES.enteredPriceRequired,
    PRICING_ERROR_CODES.enteredPriceTooLarge,
    PRICING_ERROR_CODES.enteredPriceNotAllowed,
    PRICING_ERROR_CODES.weightNotPositive,
    PRICING_ERROR_CODES.weightNotWholeGrams,
    PRICING_ERROR_CODES.weightTooLarge,
  ])("says what the typed-price or weight refusal %s means", (code) => {
    expect(messageForCode(code)).not.toBe(vi.errors.unknown);
    expect(SYNC_CODES.map(messageForCode)).not.toContain(messageForCode(code));
  });

  it("falls back to the general sentence for a code it does not know", () => {
    expect(messageForCode("SYNC_PAYMENT_SOMETHING_NEW")).toBe(vi.errors.unknown);
    expect(messageForCode(null)).toBe(vi.errors.unknown);
  });
});
