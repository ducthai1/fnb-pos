import { describe, expect, it } from "vitest";
import { outcomeOf } from "../zod-issue-test-helpers";
import { qrRefundBodySchema } from "./qr-refund-schemas";

describe("qrRefundBodySchema", () => {
  it("takes cash or a transfer back with a note, trimmed", () => {
    expect(qrRefundBodySchema.parse({ method: "cash", note: "  Trả lại chị Lan  " })).toEqual({
      method: "cash",
      note: "Trả lại chị Lan",
    });
    const multiLine = { method: "bank_transfer", note: "Chuyển lại\nVCB 0123" };
    expect(qrRefundBodySchema.parse(multiLine)).toEqual(multiLine);
    expect(outcomeOf(qrRefundBodySchema, { method: "cash", note: "n".repeat(500) }).ok).toBe(true);
  });

  it.each([
    ["without saying how", { note: "x" }],
    ["by a way the shop has no record for", { method: "voucher", note: "x" }],
    ["without a note", { method: "cash" }],
    ["with a note of spaces only", { method: "cash", note: " \n\t " }],
    ["with a note past 500 characters", { method: "cash", note: "n".repeat(501) }],
    ["naming its own amount", { method: "cash", note: "x", amount: 1_000 }],
  ])("refuses a hand back %s", (_case, body) => {
    expect(outcomeOf(qrRefundBodySchema, body).ok).toBe(false);
  });
});
