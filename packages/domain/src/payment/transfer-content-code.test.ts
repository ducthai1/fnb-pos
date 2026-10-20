import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isDomainError } from "../errors";
import { vnd } from "../money";
import { buildVietQrPayload } from "./build-vietqr-payload";
import { PAYMENT_ERROR_CODES } from "./payment-error-codes";
import { contentCodeFromRandom, contentCodesIn, isContentCode } from "./transfer-content-code";

const bytes = fc.uint8Array({ minLength: 8, maxLength: 8 });

describe("contentCodeFromRandom", () => {
  it("draws FNB and eight base32 symbols without look-alike letters", () => {
    expect(contentCodeFromRandom(new Uint8Array([0, 1, 9, 10, 17, 18, 30, 31]))).toBe(
      "FNB019AHJYZ",
    );
  });

  it("always gives a code a VietQR can carry and the matcher can find", () => {
    fc.assert(
      fc.property(bytes, (random) => {
        const code = contentCodeFromRandom(random);
        expect(isContentCode(code)).toBe(true);
        expect(contentCodesIn(`MBVCB.123456.${code}.CT tu 0011`)).toEqual([code]);
        const qr = { bankBin: "970416", accountNumber: "1", amount: vnd(1), content: code };
        expect(() => buildVietQrPayload(qr)).not.toThrow();
      }),
    );
  });

  it("refuses fewer than eight random bytes", () => {
    try {
      contentCodeFromRandom(new Uint8Array(7));
      expect.unreachable();
    } catch (error) {
      expect(isDomainError(error, PAYMENT_ERROR_CODES.notEnoughRandomness)).toBe(true);
    }
  });
});

describe("contentCodesIn", () => {
  it.each([
    ["the code as sent", "FNB7K2M9QXA"],
    ["upper-cased by the bank, with its reference around it", "MBVCB.8812.FNB7K2M9QXA.CT"],
    ["lower-cased", "fnb7k2m9qxa thanh toan"],
    ["broken by a space the bank inserted", "FNB7K2M 9QXA"],
    ["typed with O for 0", "FNBOABCDEFG"],
  ])("finds a code %s", (_case, description) => {
    expect(contentCodesIn(description)).toHaveLength(1);
  });

  it("reads look-alike letters as the digits they stand for", () => {
    expect(contentCodesIn("FNBOABCDEFG")).toEqual(["FNB0ABCDEFG"]);
    expect(contentCodesIn("FNBlABCDEFI")).toEqual(["FNB1ABCDEF1"]);
  });

  it.each([
    ["no code", "chuyen tien an trua"],
    ["a code one symbol short", "FNB7K2M9QX"],
    ["the prefix only", "FNB"],
    ["a symbol outside the alphabet", "FNB7K2M9QXU"],
  ])("finds nothing in %s", (_case, description) => {
    expect(contentCodesIn(description)).toEqual([]);
  });

  it("names every code a description mentions, each once", () => {
    expect(contentCodesIn("FNB7K2M9QXA FNB0ABCDEFG FNB7K2M9QXA")).toEqual([
      "FNB7K2M9QXA",
      "FNB0ABCDEFG",
    ]);
  });
});
