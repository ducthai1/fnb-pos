import { describe, expect, it } from "vitest";
import { isDomainError } from "../errors";
import { vnd } from "../money";
import { type VietQrTransfer, buildVietQrPayload } from "./build-vietqr-payload";
import { crc16Hex } from "./crc16-ccitt-false";
import { parseVietQrPayload } from "./parse-vietqr-payload";
import { PAYMENT_ERROR_CODES } from "./payment-error-codes";

const SALE: VietQrTransfer = {
  bankBin: "970416",
  accountNumber: "257678859",
  amount: vnd(39_000),
  content: "FNB7K2M9QXA",
};

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (isDomainError(error)) return error.code;
    throw error;
  }
  return "no-error";
}

/** A payload with the checksum recomputed, so only the change under test is wrong. */
function resigned(body: string): string {
  return `${body}6304${crc16Hex(`${body}6304`)}`;
}

describe("buildVietQrPayload refuses", () => {
  it.each([
    ["accents", "Thanh toán bàn 3"],
    ["punctuation", "FNB7K2M9QXA - ban 3"],
    ["a line break", "FNB7K2M9QXA\nban 3"],
    ["a leading space", " FNB7K2M9QXA"],
    ["two spaces in a row", "FNB  7K2M9QXA"],
    ["nothing at all", ""],
  ])("content with %s", (_case, content) => {
    expect(codeOf(() => buildVietQrPayload({ ...SALE, content }))).toBe(
      PAYMENT_ERROR_CODES.contentInvalidCharacters,
    );
  });

  it("content longer than the 25 characters the field holds, while 25 still go", () => {
    expect(codeOf(() => buildVietQrPayload({ ...SALE, content: "A".repeat(25) }))).toBe("no-error");
    expect(codeOf(() => buildVietQrPayload({ ...SALE, content: "A".repeat(26) }))).toBe(
      PAYMENT_ERROR_CODES.contentTooLong,
    );
  });

  it.each([
    ["a bank BIN that is not six digits", { bankBin: "97041" }, "invalidBankBin"],
    ["an account number with a dash", { accountNumber: "0011-0012" }, "invalidAccountNumber"],
    [
      "an account number of 20 characters",
      { accountNumber: "1".repeat(20) },
      "invalidAccountNumber",
    ],
    ["a zero amount", { amount: vnd(0) }, "invalidAmount"],
    ["a negative amount", { amount: vnd(-1000) }, "invalidAmount"],
    ["an amount the field cannot hold", { amount: vnd(10n ** 13n) }, "invalidAmount"],
    ["a merchant name with accents", { merchantName: "Phở Sáng" }, "invalidMerchantName"],
  ] as const)("%s", (_case, change, code) => {
    expect(codeOf(() => buildVietQrPayload({ ...SALE, ...change }))).toBe(
      PAYMENT_ERROR_CODES[code],
    );
  });
});

describe("parseVietQrPayload refuses", () => {
  const good = buildVietQrPayload(SALE);
  const body = good.slice(0, -8);

  it("a payload whose amount was changed after the checksum was written", () => {
    expect(codeOf(() => parseVietQrPayload(good.replace("540539000", "540519000")))).toBe(
      PAYMENT_ERROR_CODES.checksumMismatch,
    );
  });

  it("a payload cut short", () => {
    expect(codeOf(() => parseVietQrPayload(good.slice(0, -1)))).toBe(
      PAYMENT_ERROR_CODES.malformedPayload,
    );
  });

  it("a field whose length runs past the end", () => {
    expect(codeOf(() => parseVietQrPayload(resigned(`${body}5409123`)))).toBe(
      PAYMENT_ERROR_CODES.malformedPayload,
    );
  });

  it("a field given twice", () => {
    expect(codeOf(() => parseVietQrPayload(resigned(`${body}5802VN`)))).toBe(
      PAYMENT_ERROR_CODES.malformedPayload,
    );
  });

  it.each([
    ["another network's application id", "A000000727", "A000000728"],
    ["a transfer to a card number", "QRIBFTTA", "QRIBFTTC"],
    ["another currency", "5303704", "5303840"],
  ])("%s", (_case, from, to) => {
    expect(codeOf(() => parseVietQrPayload(resigned(body.replace(from, to))))).toBe(
      PAYMENT_ERROR_CODES.notAVietQrTransfer,
    );
  });

  it("an amount with a decimal point", () => {
    const decimal = body.replace("540539000", "540739000.5");
    expect(codeOf(() => parseVietQrPayload(resigned(decimal)))).toBe(
      PAYMENT_ERROR_CODES.invalidAmount,
    );
  });
});
