import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cp1258CodePointOf } from "./cp1258-table";
import { VIETNAMESE_LETTERS_CP1258 } from "./cp1258-vietnamese-letters";
import { ASCII_FOLD, CP1258, encodeText } from "./encode-text";
import { printWidth } from "./print-cells";

const anyText = fc.oneof(
  fc.string({ unit: "binary", maxLength: 40 }),
  fc.string({ unit: "grapheme", maxLength: 40 }),
  fc.string({ unit: "binary-ascii", maxLength: 40 }),
);

const vietnameseText = fc
  .array(
    fc.oneof(
      fc.constantFrom(...VIETNAMESE_LETTERS_CP1258.map(([letter]) => letter)),
      fc.constantFrom(" ", ".", ",", "-", "0", "9", "b", "Q", "₫"),
    ),
    { maxLength: 40 },
  )
  .map((parts) => parts.join(""));

const isControl = (b: number) => b < 0x20 || b === 0x7f;

function decodeCp1258(bytes: Uint8Array): string {
  return String.fromCodePoint(...Array.from(bytes, (b) => cp1258CodePointOf(b) ?? 0xfffd));
}

describe("text encoding over arbitrary input", () => {
  it("ascii-fold never emits a byte above 0x7F, nor a control byte", () => {
    fc.assert(
      fc.property(anyText, (text) => {
        const bytes = encodeText(text, ASCII_FOLD);
        expect(bytes.every((b) => b <= 0x7f && !isControl(b))).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it("windows-1258 never emits a control byte or an unassigned one", () => {
    fc.assert(
      fc.property(anyText, (text) => {
        const bytes = encodeText(text, CP1258);
        expect(bytes.every((b) => !isControl(b) && cp1258CodePointOf(b) !== undefined)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it("ascii-fold spends one byte per column the layout measured", () => {
    fc.assert(
      fc.property(anyText, (text) => {
        expect(encodeText(text, ASCII_FOLD).length).toBe(printWidth(text));
      }),
      { numRuns: 500 },
    );
  });

  it("Vietnamese text read back from its windows-1258 bytes is the same text", () => {
    fc.assert(
      fc.property(vietnameseText, (text) => {
        const bytes = encodeText(text, CP1258);
        expect(decodeCp1258(bytes).normalize("NFC")).toBe(text.normalize("NFC"));
      }),
      { numRuns: 500 },
    );
  });
});
