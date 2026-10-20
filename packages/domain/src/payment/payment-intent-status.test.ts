import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isDomainError } from "../errors";
import { vnd } from "../money";
import { PAYMENT_ERROR_CODES } from "./payment-error-codes";
import {
  PAYMENT_INTENT_STATUSES,
  type PaymentIntentStatus,
  settlePaymentIntent,
  settlementOfTransfer,
  transitionPaymentIntent,
} from "./payment-intent-status";

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (isDomainError(error)) return error.code;
    throw error;
  }
  return "no-error";
}

describe("settlementOfTransfer", () => {
  it.each([
    [39_000, 39_000, "paid"],
    [39_000, 38_999, "partial"],
    [39_000, 40_000, "overpaid"],
  ] as const)("asked %i, received %i: %s", (asked, received, settlement) => {
    expect(settlementOfTransfer(vnd(asked), vnd(received))).toBe(settlement);
  });

  it("is paid exactly when the amounts are equal", () => {
    const amount = fc.bigInt({ min: 1n, max: 10n ** 12n });
    fc.assert(
      fc.property(amount, amount, (asked, received) => {
        const settlement = settlementOfTransfer(vnd(asked), vnd(received));
        expect(settlement === "paid").toBe(asked === received);
        expect(settlement === "partial").toBe(received < asked);
      }),
    );
  });

  it("refuses a transfer of nothing or of a negative amount", () => {
    expect(codeOf(() => settlementOfTransfer(vnd(1000), vnd(0)))).toBe(
      PAYMENT_ERROR_CODES.invalidAmount,
    );
    expect(codeOf(() => settlementOfTransfer(vnd(1000), vnd(-1000)))).toBe(
      PAYMENT_ERROR_CODES.invalidAmount,
    );
  });
});

describe("transitionPaymentIntent", () => {
  it.each([
    ["pending", "paid"],
    ["pending", "partial"],
    ["pending", "overpaid"],
    ["pending", "expired"],
    ["pending", "cancelled"],
    ["expired", "paid"],
    ["expired", "overpaid"],
  ] as const)("lets %s become %s", (from, to) => {
    expect(transitionPaymentIntent(from, to)).toBe(to);
  });

  const settled: PaymentIntentStatus[] = ["paid", "partial", "overpaid", "cancelled"];
  it.each(settled.flatMap((from) => PAYMENT_INTENT_STATUSES.map((to) => [from, to] as const)))(
    "never lets a %s intent become %s",
    (from, to) => {
      expect(codeOf(() => transitionPaymentIntent(from, to))).toBe(
        PAYMENT_ERROR_CODES.invalidIntentTransition,
      );
    },
  );

  it("never brings an expired intent back to pending or cancels it", () => {
    for (const to of ["pending", "expired", "cancelled"] as const) {
      expect(codeOf(() => transitionPaymentIntent("expired", to))).toBe(
        PAYMENT_ERROR_CODES.invalidIntentTransition,
      );
    }
  });
});

describe("settlePaymentIntent", () => {
  it("settles a pending intent by what arrived", () => {
    expect(settlePaymentIntent("pending", vnd(39_000), vnd(20_000))).toBe("partial");
  });

  it("refuses a second transfer for an intent already paid", () => {
    expect(codeOf(() => settlePaymentIntent("paid", vnd(39_000), vnd(39_000)))).toBe(
      PAYMENT_ERROR_CODES.invalidIntentTransition,
    );
  });
});
