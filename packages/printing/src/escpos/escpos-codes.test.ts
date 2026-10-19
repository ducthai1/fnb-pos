import { describe, expect, it } from "vitest";
import { toHex } from "../bytes/bytes";
import { PRINTING_ERROR_CODES as C } from "../printing-error-codes";
import { printingCodeOf } from "../test-support/printing-error-code";
import { printCode128, printQrCode } from "./escpos-codes";

describe("QR codes (GS ( k)", () => {
  it("sets model 2, module size and error level, stores the data, then prints it", () => {
    expect(
      toHex(printQrCode("AB", { moduleSize: 6, errorCorrection: "M" }), 64).split(" 1d "),
    ).toEqual([
      "1d 28 6b 04 00 31 41 32 00",
      "28 6b 03 00 31 43 06",
      "28 6b 03 00 31 45 31",
      "28 6b 05 00 31 50 30 41 42",
      "28 6b 03 00 31 51 30",
    ]);
  });

  it("maps each error level to its argument", () => {
    const level = (ecc: "L" | "M" | "Q" | "H") =>
      toHex(printQrCode("A", { moduleSize: 1, errorCorrection: ecc }), 64).split(" ")[24];
    expect([level("L"), level("M"), level("Q"), level("H")]).toEqual(["30", "31", "32", "33"]);
  });

  it("writes the stored length little-endian once the data passes 252 bytes", () => {
    const store = toHex(printQrCode("x".repeat(300)), 4096)
      .split(" ")
      .slice(25, 32);
    expect(store).toEqual(["1d", "28", "6b", "2f", "01", "31", "50"]);
  });

  it("accepts the largest payload a QR symbol holds and refuses one byte more", () => {
    expect(printingCodeOf(() => printQrCode("9".repeat(2953)))).toBeUndefined();
    expect(printingCodeOf(() => printQrCode("9".repeat(2954)))).toBe(C.invalidQrData);
  });

  it("refuses an empty payload, a non-ASCII one and one with a control byte", () => {
    expect(printingCodeOf(() => printQrCode(""))).toBe(C.invalidQrData);
    expect(printingCodeOf(() => printQrCode("Cà phê"))).toBe(C.invalidQrData);
    expect(printingCodeOf(() => printQrCode("ok\x1bp"))).toBe(C.invalidQrData);
  });

  it("refuses a module size outside 1–16", () => {
    expect(printingCodeOf(() => printQrCode("A", { moduleSize: 16, errorCorrection: "L" }))).toBe(
      undefined,
    );
    expect(printingCodeOf(() => printQrCode("A", { moduleSize: 0, errorCorrection: "L" }))).toBe(
      C.argumentOutOfRange,
    );
    expect(printingCodeOf(() => printQrCode("A", { moduleSize: 17, errorCorrection: "L" }))).toBe(
      C.argumentOutOfRange,
    );
  });
});

describe("CODE128 barcodes (GS k 73)", () => {
  it("sets height, width and readable text, then sends code set B with its length", () => {
    expect(toHex(printCode128("HD-12"), 64)).toBe(
      "1d 68 50 1d 77 02 1d 48 02 1d 6b 49 07 7b 42 48 44 2d 31 32",
    );
  });

  it("doubles a literal brace, which would otherwise switch code sets", () => {
    const bytes = printCode128("{1", { height: 40, moduleWidth: 3, showText: false });
    expect(toHex(bytes, 64)).toBe("1d 68 28 1d 77 03 1d 48 00 1d 6b 49 05 7b 42 7b 7b 31");
  });

  it("refuses data a CODE128 symbol cannot carry", () => {
    expect(printingCodeOf(() => printCode128(""))).toBe(C.invalidBarcodeData);
    expect(printingCodeOf(() => printCode128("Mã 1"))).toBe(C.invalidBarcodeData);
    expect(printingCodeOf(() => printCode128("x".repeat(253)))).toBeUndefined();
    expect(printingCodeOf(() => printCode128("x".repeat(254)))).toBe(C.invalidBarcodeData);
    expect(printingCodeOf(() => printCode128(`${"x".repeat(252)}{`))).toBe(C.invalidBarcodeData);
  });

  it("refuses a bar width the printer does not support", () => {
    const options = { height: 80, moduleWidth: 7, showText: true };
    expect(printingCodeOf(() => printCode128("A", options))).toBe(C.argumentOutOfRange);
  });
});
