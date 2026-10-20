import type { PaymentIntentSnapshot } from "@fnb/contracts";
import { vnd } from "@fnb/domain";
import { describe, expect, it } from "vitest";
import { countdownText, qrPhaseOf } from "./qr-intent-phase";

const NOW = Date.parse("2026-10-20T03:00:00.000Z");
const intent = (change: Partial<PaymentIntentSnapshot> = {}): PaymentIntentSnapshot => ({
  id: "0199f000-0000-7000-8000-00000000a001",
  orderId: "0199f000-0000-7000-8000-00000000a002",
  branchId: "0199f000-0000-7000-8000-00000000a003",
  amount: 58_000,
  contentCode: "FNB7K2M9QXA",
  status: "pending",
  expiresAt: new Date(NOW + 10 * 60_000).toISOString(),
  receivedAmount: null,
  version: 1,
  ...change,
});
const phase = (change: Partial<PaymentIntentSnapshot>, now = NOW) =>
  qrPhaseOf({ intent: intent(change), refusal: null }, now);

describe("what the QR on screen has come to", () => {
  it("waits with the seconds left until the server's expiry, then has expired", () => {
    expect(phase({})).toEqual({ kind: "waiting", secondsLeft: 600 });
    expect(phase({}, NOW + 10 * 60_000 - 1)).toEqual({ kind: "waiting", secondsLeft: 1 });
    expect(phase({}, NOW + 10 * 60_000)).toEqual({ kind: "expired", lateTransfer: false });
  });

  it("closes only on an exact payment; short or over says by how much, to the đồng", () => {
    expect(phase({ status: "paid", receivedAmount: 58_000 })).toEqual({ kind: "paid" });
    expect(phase({ status: "partial", receivedAmount: 50_001 })).toEqual({
      kind: "short",
      gap: vnd(7_999),
    });
    expect(phase({ status: "overpaid", receivedAmount: 1_058_000 })).toEqual({
      kind: "over",
      gap: vnd(1_000_000),
    });
  });

  it("tells a QR the server expired on a late transfer from one that ran out quietly", () => {
    expect(phase({ status: "expired" })).toEqual({ kind: "expired", lateTransfer: true });
    expect(phase({ status: "cancelled" })).toEqual({ kind: "withdrawn" });
  });

  it("puts a refusal of the QR before anything its row says", () => {
    const refused = qrPhaseOf({ intent: intent(), refusal: "SYNC_ORDER_HAS_SETTLED_QR" }, NOW);
    expect(refused).toEqual({ kind: "refused", code: "SYNC_ORDER_HAS_SETTLED_QR" });
    expect(qrPhaseOf({ intent: null, refusal: null }, NOW)).toEqual({ kind: "drawing" });
  });

  it("writes the time left as minutes and seconds", () => {
    expect(countdownText(900)).toBe("15:00");
    expect(countdownText(61)).toBe("01:01");
    expect(countdownText(1)).toBe("00:01");
  });
});
