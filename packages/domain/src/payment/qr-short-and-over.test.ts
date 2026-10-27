import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isDomainError } from "../errors";
import { addVnd, vnd } from "../money";
import { PAYMENT_ERROR_CODES } from "./payment-error-codes";
import { qrExcess, qrTenderAmount, remainderAfterShortTransfers } from "./qr-short-and-over";

const refusalOf = (run: () => unknown) => {
  try {
    run();
    return null;
  } catch (error) {
    return isDomainError(error) ? error.code : "other";
  }
};

describe("a QR transfer that came short or over", () => {
  it("puts what it brought toward the order when short, what it asked when exact or over", () => {
    expect(qrTenderAmount("partial", vnd(50_000), vnd(45_000))).toBe(45_000n);
    expect(qrTenderAmount("paid", vnd(50_000), vnd(50_000))).toBe(50_000n);
    expect(qrTenderAmount("overpaid", vnd(50_000), vnd(60_000))).toBe(50_000n);
  });

  it("owes the customer exactly what an over transfer brought beyond the QR", () => {
    expect(qrExcess(vnd(50_000), vnd(60_000))).toBe(10_000n);
    expect(refusalOf(() => qrExcess(vnd(50_000), vnd(50_000)))).toBe(
      PAYMENT_ERROR_CODES.invalidAmount,
    );
  });

  it("leaves exactly the rest of the order for the next tender", () => {
    expect(remainderAfterShortTransfers(vnd(50_000), [vnd(45_000)])).toBe(5_000n);
    expect(remainderAfterShortTransfers(vnd(50_000), [vnd(30_000), vnd(15_000)])).toBe(5_000n);
    expect(remainderAfterShortTransfers(vnd(50_000), [])).toBe(50_000n);
    expect(refusalOf(() => remainderAfterShortTransfers(vnd(50_000), [vnd(50_000)]))).toBe(
      PAYMENT_ERROR_CODES.invalidAmount,
    );
  });

  it("short transfers plus the remainder always add up to the order", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10_000_000 }),
        fc.array(fc.integer({ min: 1, max: 1_000_000 }), { maxLength: 4 }),
        (due, parts) => {
          const received = parts.map((part) => vnd(part));
          fc.pre(addVnd(...received) < BigInt(due));
          const rest = remainderAfterShortTransfers(vnd(due), received);
          expect(addVnd(rest, ...received)).toBe(BigInt(due));
          expect(rest > 0n).toBe(true);
        },
      ),
    );
  });
});
