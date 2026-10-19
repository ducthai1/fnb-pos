import { describe, expect, it } from "vitest";
import { printWidth, toPrintCells } from "./print-cells";

describe("print cells", () => {
  it("counts a letter with its tone mark as one column, however it was typed", () => {
    expect(toPrintCells("Phở")).toEqual(["P", "h", "ở"]);
    expect(toPrintCells("Pho\u031b\u0309")).toEqual(["P", "h", "ở"]);
    expect(printWidth("Nước ép")).toBe(7);
  });

  it("turns tabs and line breaks into spaces and drops other controls", () => {
    expect(toPrintCells("a\tb\r\nc\u2028d")).toEqual(["a", " ", "b", " ", " ", "c", " ", "d"]);
    expect(toPrintCells("a\x1b\x00\x7fb")).toEqual(["a", "b"]);
  });

  it("drops zero-width joiners, variation selectors, skin tones and a mark with no letter", () => {
    expect(toPrintCells("👨\u200d👩\u200d👧")).toEqual(["👨", "👩", "👧"]);
    expect(toPrintCells("❤\ufe0f👍🏽")).toEqual(["❤", "👍"]);
    expect(toPrintCells("\u0301a \u0301b")).toEqual(["a", " ", "b"]);
  });
});
