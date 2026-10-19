import { describe, expect, it } from "vitest";
import { toHex } from "../bytes/bytes";
import { PRINTING_ERROR_CODES as C } from "../printing-error-codes";
import { printingCodeOf } from "../test-support/printing-error-code";
import { ASCII_FOLD, CP1258 } from "../text/encode-text";
import {
  tsplClear,
  tsplCodePage,
  tsplGap,
  tsplPrint,
  tsplQrCode,
  tsplSize,
  tsplText,
} from "./tspl-commands";

const ascii = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);
const at = { x: 8, y: 16, font: "2", xScale: 1, yScale: 1 };

describe("TSPL commands, byte for byte", () => {
  it("sizes the label, sets the gap, clears the buffer and prints", () => {
    expect(ascii(tsplSize(40, 30))).toBe("SIZE 40 mm,30 mm\r\n");
    expect(ascii(tsplSize(50.8, 25.4))).toBe("SIZE 50.8 mm,25.4 mm\r\n");
    expect(ascii(tsplGap(2))).toBe("GAP 2 mm,0 mm\r\n");
    expect(ascii(tsplGap(0, 1.5))).toBe("GAP 0 mm,1.5 mm\r\n");
    expect(ascii(tsplClear())).toBe("CLS\r\n");
    expect(ascii(tsplPrint())).toBe("PRINT 1,1\r\n");
    expect(ascii(tsplPrint(2, 3))).toBe("PRINT 2,3\r\n");
  });

  it("refuses a label size, gap or count the printer cannot take", () => {
    expect(printingCodeOf(() => tsplSize(0, 30))).toBe(C.argumentOutOfRange);
    expect(printingCodeOf(() => tsplSize(40, 201))).toBe(C.argumentOutOfRange);
    expect(printingCodeOf(() => tsplGap(-1))).toBe(C.argumentOutOfRange);
    expect(printingCodeOf(() => tsplPrint(0))).toBe(C.argumentOutOfRange);
  });

  it("selects the configured code page, a bare word only", () => {
    expect(ascii(tsplCodePage("1258"))).toBe("CODEPAGE 1258\r\n");
    expect(ascii(tsplCodePage("UTF-8"))).toBe("CODEPAGE UTF-8\r\n");
    expect(printingCodeOf(() => tsplCodePage("1258\r\nPRINT 99"))).toBe(C.invalidCodePageName);
    expect(printingCodeOf(() => tsplCodePage(""))).toBe(C.invalidCodePageName);
  });

  it("writes TEXT with the text in the chosen encoding", () => {
    expect(ascii(tsplText("Trà đào", at, ASCII_FOLD))).toBe('TEXT 8,16,"2",0,1,1,"Tra dao"\r\n');
    expect(toHex(tsplText("đá", { ...at, x: 0, y: 0, xScale: 2 }, CP1258), 64)).toBe(
      "54 45 58 54 20 30 2c 30 2c 22 32 22 2c 30 2c 32 2c 31 2c 22 f0 e1 22 0d 0a",
    );
  });

  it("escapes a quote and turns line breaks and backslashes into harmless characters", () => {
    const note = 'ít "đá"\r\nPRINT 99\\[R]';
    expect(ascii(tsplText(note, at, ASCII_FOLD))).toBe(
      'TEXT 8,16,"2",0,1,1,"it \\["]da\\["]  PRINT 99?[R]"\r\n',
    );
  });

  it("refuses a font name or magnification that would break the command", () => {
    expect(printingCodeOf(() => tsplText("a", { ...at, font: 'x",0' }, ASCII_FOLD))).toBe(
      C.invalidFontName,
    );
    expect(printingCodeOf(() => tsplText("a", { ...at, font: "TSS24.BF2" }, CP1258))).toBe(
      undefined,
    );
    expect(printingCodeOf(() => tsplText("a", { ...at, xScale: 11 }, ASCII_FOLD))).toBe(
      C.argumentOutOfRange,
    );
    expect(printingCodeOf(() => tsplText("a", { ...at, x: -1 }, ASCII_FOLD))).toBe(
      C.argumentOutOfRange,
    );
  });

  it("writes QRCODE with the payload quoted", () => {
    const qr = { x: 200, y: 10, errorCorrection: "M" as const, cellWidth: 4 };
    expect(ascii(tsplQrCode("HD-1", qr))).toBe('QRCODE 200,10,M,4,A,0,"HD-1"\r\n');
    expect(ascii(tsplQrCode('a"b', qr))).toBe('QRCODE 200,10,M,4,A,0,"a\\["]b"\r\n');
  });

  it("refuses a QR payload it would have to change", () => {
    const qr = { x: 0, y: 0, errorCorrection: "L" as const, cellWidth: 4 };
    expect(printingCodeOf(() => tsplQrCode("a\\b", qr))).toBe(C.invalidQrData);
    expect(printingCodeOf(() => tsplQrCode("đ", qr))).toBe(C.invalidQrData);
    expect(printingCodeOf(() => tsplQrCode("", qr))).toBe(C.invalidQrData);
    expect(printingCodeOf(() => tsplQrCode("a\r\nPRINT 9", qr))).toBe(C.invalidQrData);
    expect(printingCodeOf(() => tsplQrCode("a", { ...qr, cellWidth: 11 }))).toBe(
      C.argumentOutOfRange,
    );
  });
});
