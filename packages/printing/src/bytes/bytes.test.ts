import { describe, expect, it } from "vitest";
import { PRINTING_ERROR_CODES as C } from "../printing-error-codes";
import { printingCodeOf } from "../test-support/printing-error-code";
import { assertArgumentRange, asciiBytes, concatBytes, fromHex, toHex } from "./bytes";

describe("byte helpers", () => {
  it("shows bytes as lower-case hex pairs, 16 per line, and reads them back", () => {
    const bytes = Uint8Array.from({ length: 18 }, (_, i) => i * 15);
    const hex = toHex(bytes);
    expect(hex.split("\n")).toEqual(["00 0f 1e 2d 3c 4b 5a 69 78 87 96 a5 b4 c3 d2 e1", "f0 ff"]);
    expect(fromHex(hex)).toEqual(bytes);
  });

  it("refuses a hex string that is not whole bytes", () => {
    expect(printingCodeOf(() => fromHex("1b 4"))).toBe(C.invalidHex);
    expect(printingCodeOf(() => fromHex("zz"))).toBe(C.invalidHex);
    expect(printingCodeOf(() => fromHex(" 1b\n40 "))).toBeUndefined();
  });

  it("joins chunks in order", () => {
    expect(toHex(concatBytes([1], Uint8Array.of(2, 3), [], asciiBytes("A")))).toBe("01 02 03 41");
  });

  it("accepts an argument at both ends of its range and refuses one past either end", () => {
    expect(assertArgumentRange("X", 0, 0, 255)).toBe(0);
    expect(assertArgumentRange("X", 255, 0, 255)).toBe(255);
    expect(printingCodeOf(() => assertArgumentRange("X", 256, 0, 255))).toBe(C.argumentOutOfRange);
    expect(printingCodeOf(() => assertArgumentRange("X", -1, 0, 255))).toBe(C.argumentOutOfRange);
    expect(printingCodeOf(() => assertArgumentRange("X", 1.5, 0, 255))).toBe(C.argumentOutOfRange);
    expect(printingCodeOf(() => assertArgumentRange("X", Number.NaN, 0, 255))).toBe(
      C.argumentOutOfRange,
    );
  });
});
