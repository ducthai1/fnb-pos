import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isDomainError } from "../errors";
import { vnd } from "../money";
import { buildVietQrPayload } from "./build-vietqr-payload";
import { crc16Hex } from "./crc16-ccitt-false";
import { parseVietQrPayload } from "./parse-vietqr-payload";
import { PAYMENT_ERROR_CODES } from "./payment-error-codes";

const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split("");
const word = (max: number) =>
  fc.array(fc.constantFrom(...ALNUM), { minLength: 1, maxLength: max }).map((c) => c.join(""));
/** Words joined by single spaces, cut to the field's 25 characters at a word boundary. */
const safeText = fc
  .array(word(8), { minLength: 1, maxLength: 5 })
  .map((words) => words.join(" "))
  .filter((text) => text.length <= 25);

const transfer = fc.record(
  {
    bankBin: fc.stringMatching(/^\d{6}$/),
    accountNumber: fc.stringMatching(/^[0-9A-Za-z]{1,19}$/),
    amount: fc.bigInt({ min: 1n, max: 9_999_999_999_999n }).map((n) => vnd(n)),
    content: safeText,
    merchantName: safeText,
  },
  { requiredKeys: ["bankBin", "accountNumber", "amount", "content"] },
);

describe("every VietQR payload built", () => {
  it("parses back to the transfer it was built from", () => {
    fc.assert(
      fc.property(transfer, (t) => {
        expect(parseVietQrPayload(buildVietQrPayload(t))).toEqual({
          initiation: "dynamic",
          bankBin: t.bankBin,
          accountNumber: t.accountNumber,
          amount: t.amount,
          content: t.content,
          merchantName: t.merchantName ?? null,
        });
      }),
      { numRuns: 2000 },
    );
  });

  it("ends with the checksum of everything before it", () => {
    fc.assert(
      fc.property(transfer, (t) => {
        const payload = buildVietQrPayload(t);
        expect(payload.slice(-8, -4)).toBe("6304");
        expect(payload.slice(-4)).toBe(crc16Hex(payload.slice(0, -4)));
      }),
      { numRuns: 2000 },
    );
  });

  it("is refused when any one character of it is changed", () => {
    const changed = fc
      .tuple(transfer, fc.nat(), fc.constantFrom(..."0123456789ABCDEFXYZ "))
      .map(([t, at, by]) => {
        const payload = buildVietQrPayload(t);
        const index = at % payload.length;
        return { payload, altered: payload.slice(0, index) + by + payload.slice(index + 1) };
      })
      .filter(({ payload, altered }) => payload !== altered);
    fc.assert(
      fc.property(changed, ({ altered }) => {
        let code = "no-error";
        try {
          parseVietQrPayload(altered);
        } catch (error) {
          if (!isDomainError(error)) throw error;
          code = error.code;
        }
        expect(Object.values(PAYMENT_ERROR_CODES)).toContain(code);
      }),
      { numRuns: 2000 },
    );
  });
});
