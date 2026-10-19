import { describe, expect, it } from "vitest";
import { toHex } from "../bytes/bytes";
import { PRINTING_ERROR_CODES as C } from "../printing-error-codes";
import { printingCodeOf } from "../test-support/printing-error-code";
import {
  cutPaper,
  feedLines,
  initializePrinter,
  lineFeed,
  openCashDrawer,
  selectCodePage,
  setAlignment,
  setBold,
  setTextSize,
} from "./escpos-commands";

describe("ESC/POS commands, byte for byte", () => {
  it("initializes, picks the configured code page, aligns and sets bold", () => {
    expect(toHex(initializePrinter())).toBe("1b 40");
    expect(toHex(selectCodePage(30))).toBe("1b 74 1e");
    expect(toHex(selectCodePage(94))).toBe("1b 74 5e");
    expect(toHex(setAlignment("left"))).toBe("1b 61 00");
    expect(toHex(setAlignment("center"))).toBe("1b 61 01");
    expect(toHex(setAlignment("right"))).toBe("1b 61 02");
    expect(toHex(setBold(true))).toBe("1b 45 01");
    expect(toHex(setBold(false))).toBe("1b 45 00");
  });

  it("packs width and height into the two nibbles of GS !", () => {
    expect(toHex(setTextSize(1, 1))).toBe("1d 21 00");
    expect(toHex(setTextSize(2, 2))).toBe("1d 21 11");
    expect(toHex(setTextSize(2, 1))).toBe("1d 21 10");
    expect(toHex(setTextSize(1, 3))).toBe("1d 21 02");
    expect(toHex(setTextSize(8, 8))).toBe("1d 21 77");
  });

  it("refuses a size the printer would read as another size", () => {
    expect(printingCodeOf(() => setTextSize(0, 1))).toBe(C.argumentOutOfRange);
    expect(printingCodeOf(() => setTextSize(1, 9))).toBe(C.argumentOutOfRange);
  });

  it("feeds and cuts", () => {
    expect(toHex(lineFeed())).toBe("0a");
    expect(toHex(feedLines(3))).toBe("1b 64 03");
    expect(toHex(cutPaper({ partial: false, feedLines: 4 }))).toBe("1d 56 41 04");
    expect(toHex(cutPaper({ partial: true, feedLines: 0 }))).toBe("1d 56 42 00");
    expect(printingCodeOf(() => feedLines(256))).toBe(C.argumentOutOfRange);
    expect(printingCodeOf(() => cutPaper({ partial: true, feedLines: -1 }))).toBe(
      C.argumentOutOfRange,
    );
  });

  it("refuses a code page number that does not fit the command", () => {
    expect(toHex(selectCodePage(255))).toBe("1b 74 ff");
    expect(printingCodeOf(() => selectCodePage(256))).toBe(C.argumentOutOfRange);
    expect(printingCodeOf(() => selectCodePage(-1))).toBe(C.argumentOutOfRange);
  });

  it("kicks the drawer with a pulse in 2 ms steps, never shorter than asked", () => {
    expect(toHex(openCashDrawer())).toBe("1b 70 00 19 fa");
    expect(toHex(openCashDrawer({ pin: 5, onMs: 51, offMs: 2 }))).toBe("1b 70 01 1a 01");
    expect(toHex(openCashDrawer({ pin: 2, onMs: 510, offMs: 510 }))).toBe("1b 70 00 ff ff");
  });

  it("refuses a drawer pulse of zero or longer than the command can say", () => {
    expect(printingCodeOf(() => openCashDrawer({ pin: 2, onMs: 0, offMs: 500 }))).toBe(
      C.argumentOutOfRange,
    );
    expect(printingCodeOf(() => openCashDrawer({ pin: 2, onMs: 50, offMs: 511 }))).toBe(
      C.argumentOutOfRange,
    );
  });
});
