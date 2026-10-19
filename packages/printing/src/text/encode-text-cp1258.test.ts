import { describe, expect, it } from "vitest";
import { toHex } from "../bytes/bytes";
import { PRINTING_ERROR_CODES as C } from "../printing-error-codes";
import { printingCodeOf } from "../test-support/printing-error-code";
import { VIETNAMESE_LETTERS_CP1258 } from "./cp1258-vietnamese-letters";
import { ASCII_FOLD, CP1258, encodeText } from "./encode-text";

const cp1258Hex = (text: string) => toHex(encodeText(text, CP1258), 1024);

describe("Windows-1258 encoding of Vietnamese", () => {
  it("spells all 146 letters × tones as Windows writes them", () => {
    const pairs = VIETNAMESE_LETTERS_CP1258;
    expect(pairs).toHaveLength(146);
    for (const [letter, hex] of pairs) {
      expect({ letter, hex: cp1258Hex(letter) }).toEqual({ letter, hex });
    }
  });

  it("gives the same bytes for decomposed input as for precomposed", () => {
    for (const [letter, hex] of VIETNAMESE_LETTERS_CP1258) {
      expect(cp1258Hex(letter.normalize("NFD"))).toBe(hex);
    }
    // a, combining tone, then combining circumflex: canonical reordering puts them back in order
    expect(cp1258Hex("a\u0301\u0302")).toBe("e2 ec");
  });

  it("spells a whole phrase, the dong sign and the non-breaking space of formatVnd", () => {
    expect(cp1258Hex("Cà phê sữa đá")).toBe("43 e0 20 70 68 ea 20 73 fd de 61 20 f0 e1");
    expect(cp1258Hex("45.000\u00a0₫")).toBe("34 35 2e 30 30 30 a0 fe");
  });

  it("uses the code page's own letters for the other Latin names on a menu", () => {
    expect(cp1258Hex("Façade über Crème brûlée")).toBe(
      "46 61 e7 61 64 65 20 fc 62 65 72 20 43 72 e8 6d 65 20 62 72 fb 6c e9 65",
    );
  });

  it("keeps the letter and drops a mark the code page lacks", () => {
    expect(cp1258Hex("n\u0302")).toBe("6e");
    expect(cp1258Hex("a\u0301\u0300")).toBe("e1");
    expect(cp1258Hex("ǹ")).toBe("6e cc");
  });

  it("prints the replacement once per cell it cannot spell, and folds what it can", () => {
    expect(cp1258Hex("Trà 🧋 x2")).toBe("54 72 e0 20 3f 20 78 32");
    expect(cp1258Hex("👨\u200d👩\u200d👧")).toBe("3f 3f 3f");
    expect(cp1258Hex("Łódź")).toBe("4c f3 64 7a ec");
    expect(toHex(encodeText("茶", { scheme: "cp1258", replacement: "*" }))).toBe("2a");
  });

  it("never lets a control character through as a command", () => {
    expect(cp1258Hex("A\x1bp\x00\x19B")).toBe("41 70 42");
    expect(cp1258Hex("ít\nđá\tthôi")).toBe("ed 74 20 f0 e1 20 74 68 f4 69");
  });

  it("refuses a replacement that is not one printable ASCII character", () => {
    for (const replacement of ["", "??", "\x1b", "é", "\n"]) {
      expect(printingCodeOf(() => encodeText("x", { scheme: "cp1258", replacement }))).toBe(
        C.invalidReplacement,
      );
      expect(printingCodeOf(() => encodeText("x", { ...ASCII_FOLD, replacement }))).toBe(
        C.invalidReplacement,
      );
    }
    expect(printingCodeOf(() => encodeText("x", { ...ASCII_FOLD, replacement: "#" }))).toBe(
      undefined,
    );
  });
});

describe("ASCII folding for printers without Windows-1258", () => {
  it("drops every tone and vowel mark and turns đ into d", () => {
    const fold = (text: string) => new TextDecoder().decode(encodeText(text, ASCII_FOLD));
    expect(fold("Cà phê sữa đá – ĐẶC BIỆT")).toBe("Ca phe sua da - DAC BIET");
    for (const [letter] of VIETNAMESE_LETTERS_CP1258) {
      const base = letter.normalize("NFD")[0] ?? "";
      const expected = letter === "đ" ? "d" : letter === "Đ" ? "D" : base;
      expect(fold(letter)).toBe(expected);
    }
    expect(fold("45.000\u00a0₫")).toBe("45.000 d");
    expect(fold("Trà 🧋")).toBe("Tra ?");
  });
});
