import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { printWidth, toPrintCells } from "../text/print-cells";
import { layOutDocument } from "./lay-out-document";
import type { LaidOutLine, PrintBlock } from "./print-document";

const texts = (lines: LaidOutLine[]) => lines.map((l) => (l.kind === "text" ? l.text : l.kind));

describe("laying out a document", () => {
  it("aligns text with spaces, centre rounding left", () => {
    const doc: PrintBlock[] = [
      { kind: "text", text: "abc", align: "center" },
      { kind: "text", text: "abc", align: "right" },
      { kind: "text", text: "abc", indent: 2 },
    ];
    expect(texts(layOutDocument(doc, 8))).toEqual(["  abc", "     abc", "  abc"]);
  });

  it("halves the width of large text, since each letter takes two columns", () => {
    const lines = layOutDocument([{ kind: "text", text: "abcdefgh", large: true }], 8);
    expect(texts(lines)).toEqual(["abcd", "efgh"]);
    expect(lines.every((l) => l.kind === "text" && l.large)).toBe(true);
  });

  it("puts the right column on the first line of a wrapped left column", () => {
    const doc: PrintBlock[] = [
      { kind: "columns", left: "Trà sữa trân châu", right: "35.000", indent: 1 },
    ];
    expect(texts(layOutDocument(doc, 18))).toEqual([" Trà sữa    35.000", " trân châu"]);
  });

  it("gives the left column its own lines when the right one leaves it too little room", () => {
    const doc: PrintBlock[] = [{ kind: "columns", left: "Tổng", right: "1.234.567.890.000" }];
    expect(texts(layOutDocument(doc, 20))).toEqual(["Tổng", "   1.234.567.890.000"]);
  });

  it("draws rules across the paper and passes QR codes and cuts through", () => {
    const doc: PrintBlock[] = [
      { kind: "rule", char: "=" },
      { kind: "qr", data: "x" },
      { kind: "cut" },
      { kind: "blank" },
    ];
    expect(texts(layOutDocument(doc, 5))).toEqual(["=====", "qr", "cut", ""]);
  });
});

const blockArb: fc.Arbitrary<Extract<PrintBlock, { kind: "text" | "columns" }>> = fc.oneof(
  fc.record({
    kind: fc.constant("text" as const),
    text: fc.string({ unit: "grapheme", maxLength: 120 }),
    align: fc.constantFrom("left" as const, "center" as const, "right" as const),
    large: fc.boolean(),
    indent: fc.nat({ max: 6 }),
  }),
  fc.record({
    kind: fc.constant("columns" as const),
    left: fc.string({ unit: "grapheme", maxLength: 120 }),
    right: fc.string({ unit: "grapheme", maxLength: 40 }),
    indent: fc.nat({ max: 6 }),
  }),
);

const lettersOf = (text: string) =>
  toPrintCells(text)
    .filter((c) => c !== " ")
    .join("");

describe("layout over arbitrary text", () => {
  it("never makes a line wider than the paper, and loses no letter", () => {
    fc.assert(
      fc.property(blockArb, fc.constantFrom(32, 48), (block, columns) => {
        const lines = layOutDocument([block], columns);
        for (const line of lines) {
          if (line.kind !== "text") continue;
          expect(printWidth(line.text) * (line.large ? 2 : 1)).toBeLessThanOrEqual(columns);
        }
        const source = block.kind === "text" ? block.text : block.left + block.right;
        expect(lettersOf(texts(lines).join(""))).toBe(lettersOf(source));
      }),
      { numRuns: 400 },
    );
  });
});
