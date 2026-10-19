import { describe, expect, it } from "vitest";
import { wrapText } from "./wrap-text";

describe("wrapping text to the paper", () => {
  it("breaks between words and never past the width", () => {
    expect(wrapText("Trà sữa trân châu đường đen", 10)).toEqual([
      "Trà sữa",
      "trân châu",
      "đường đen",
    ]);
  });

  it("cuts a word longer than the line at the margin", () => {
    expect(wrapText("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
    expect(wrapText("ab cdefghij", 4)).toEqual(["ab", "cdef", "ghij"]);
  });

  it("never separates a letter from its tone mark", () => {
    expect(wrapText("Ca\u0300phe\u0302\u0301", 3)).toEqual(["Càp", "hế"]);
  });

  it("keeps the line breaks of a note, an empty line included, and collapses spaces", () => {
    expect(wrapText("Ít đá\n\n  Không   đường ", 20)).toEqual(["Ít đá", "", "Không đường"]);
    expect(wrapText("a\r\nb\rc", 20)).toEqual(["a", "b", "c"]);
  });

  it("gives one empty line for empty text", () => {
    expect(wrapText("", 10)).toEqual([""]);
  });
});
