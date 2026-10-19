import { layOutDocument } from "../layout/lay-out-document";
import {
  type LaidOutLine,
  PAPER_COLUMNS,
  type PaperWidth,
  type PrintDocument,
} from "../layout/print-document";
import { wrapText } from "../layout/wrap-text";
import type { TextEncoding } from "../text/encode-text";
import { toPrintCells } from "../text/print-cells";
import { printedText } from "../text/printed-text";

/** A double-size cell takes two columns: shown as the letter and a space, so widths stay true. */
export function spreadLarge(text: string): string {
  return toPrintCells(text)
    .map((cell) => `${cell} `)
    .join("")
    .trimEnd();
}

function previewLines(line: LaidOutLine, columns: number, encoding?: TextEncoding): string[] {
  switch (line.kind) {
    case "text": {
      const text = encoding === undefined ? line.text : printedText(line.text, encoding);
      return [(line.large ? spreadLarge(text) : text).trimEnd()];
    }
    case "qr":
      return wrapText(`[QR ${line.data}]`, columns);
    case "cut": {
      const mark = " CUT ";
      const side = Math.floor((columns - mark.length) / 2);
      return ["~".repeat(side) + mark + "~".repeat(columns - side - mark.length)];
    }
  }
}

/**
 * The slip as plain text, line for line and column for column as it prints: for review in
 * golden files and for the "print preview" on the till. Given the printer's encoding, it shows
 * what that printer can spell (folded letters, replacement characters) rather than the input.
 */
export function renderPreview(
  document: PrintDocument,
  paper: PaperWidth,
  encoding?: TextEncoding,
): string {
  const columns = PAPER_COLUMNS[paper];
  const lines = layOutDocument(document, columns).flatMap((line) =>
    previewLines(line, columns, encoding),
  );
  return `${lines.join("\n")}\n`;
}
