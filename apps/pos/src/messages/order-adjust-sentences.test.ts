import { ORDER_ERROR_CODES, TOTALS_ERROR_CODES } from "@fnb/domain";
import { describe, expect, it } from "vitest";
// The server's own list, so a code added there without a sentence here fails this test.
import { SYNC_ERROR_CODES } from "../../../api/src/sync/sync-error-codes";
import { messageForCode, vi } from "./vi";

/** What a void, a discount, a cancel or a refund can be refused with, here or by the server. */
const CODES = [
  SYNC_ERROR_CODES.orderHasSentItems,
  SYNC_ERROR_CODES.discountRateRaised,
  SYNC_ERROR_CODES.discountLineIdsTooFew,
  SYNC_ERROR_CODES.discountLineNotFound,
  SYNC_ERROR_CODES.lineLocked,
  ORDER_ERROR_CODES.voidBlockedByWholeLineDiscount,
  ORDER_ERROR_CODES.voidExceedsRemaining,
  ORDER_ERROR_CODES.voidNeedsApproval,
  ORDER_ERROR_CODES.refundEmpty,
  ORDER_ERROR_CODES.refundExceedsRemaining,
  ORDER_ERROR_CODES.refundRequiresPaidOrder,
  TOTALS_ERROR_CODES.discountOnPartlyVoidedLine,
  TOTALS_ERROR_CODES.discountExceedsBase,
  TOTALS_ERROR_CODES.nonPositiveDiscount,
];

describe("what the till says when a void, a discount or a refund cannot be made", () => {
  it.each(CODES)("says what %s means in its own sentence", (code) => {
    expect(messageForCode(code)).not.toBe(vi.errors.unknown);
  });

  it("gives each code a different sentence", () => {
    const sentences = CODES.map(messageForCode);
    expect(new Set(sentences).size).toBe(sentences.length);
  });

  it("has a label for every reason the till offers", () => {
    for (const label of Object.values(vi.reasons)) expect(label.trim()).not.toBe("");
  });
});
