import type { Alignment } from "../escpos/escpos-commands";
import { printWidth } from "../text/print-cells";
import type { LaidOutLine, PrintBlock, PrintDocument } from "./print-document";
import { wrapText } from "./wrap-text";

/** Below this many columns a name beside its amount wraps every word; it gets its own lines. */
const MIN_LEFT_COLUMNS = 8;

const spaces = (n: number) => " ".repeat(Math.max(0, n));

function text(line: string, bold = false, large = false): LaidOutLine {
  return { kind: "text", text: line, bold, large };
}

/**
 * Alignment is done here with spaces rather than with ESC a, so the preview matches the paper
 * exactly and a printer that ignores ESC a for some characters cannot shift a column.
 */
function aligned(line: string, width: number, align: Alignment): string {
  const free = width - printWidth(line);
  if (align === "right") return spaces(free) + line;
  if (align === "center") return spaces(Math.floor(free / 2)) + line;
  return line;
}

function layOutText(block: Extract<PrintBlock, { kind: "text" }>, columns: number): LaidOutLine[] {
  const large = block.large ?? false;
  // A double-width character takes two columns of the paper.
  const width = large ? Math.floor(columns / 2) : columns;
  const indent = Math.min(block.indent ?? 0, width - 1);
  return wrapText(block.text, width - indent).map((line) =>
    text(spaces(indent) + aligned(line, width - indent, block.align ?? "left"), block.bold, large),
  );
}

function layOutColumns(
  block: Extract<PrintBlock, { kind: "columns" }>,
  columns: number,
): LaidOutLine[] {
  const bold = block.bold ?? false;
  const indent = Math.min(block.indent ?? 0, columns - 1);
  const right = wrapText(block.right, columns);
  const rightLine = right[0] ?? "";
  const leftWidth = columns - indent - printWidth(rightLine) - 1;
  if (right.length > 1 || leftWidth < MIN_LEFT_COLUMNS) {
    const left = wrapText(block.left, columns - indent).map((l) => spaces(indent) + l);
    return [...left, ...right.map((r) => aligned(r, columns, "right"))].map((l) => text(l, bold));
  }
  // A name that starts with a line break (pasted from a sheet) would leave its first line
  // empty, printing the amount on a blank line above the name it belongs to.
  const wrapped = wrapText(block.left, leftWidth);
  const firstWritten = wrapped.findIndex((line) => line.trim() !== "");
  const left = firstWritten === -1 ? [""] : wrapped.slice(firstWritten);
  return left.map((line, i) => {
    const head = spaces(indent) + line;
    return text(
      i === 0
        ? head + spaces(columns - printWidth(head) - printWidth(rightLine)) + rightLine
        : head,
      bold,
    );
  });
}

function layOutBlock(block: PrintBlock, columns: number): LaidOutLine[] {
  switch (block.kind) {
    case "text":
      return layOutText(block, columns);
    case "columns":
      return layOutColumns(block, columns);
    case "rule":
      return [text(block.char.repeat(columns))];
    case "blank":
      return [text("")];
    case "qr":
      return [{ kind: "qr", data: block.data }];
    case "cut":
      return [{ kind: "cut" }];
  }
}

/** Wraps and pads every block to the paper's columns; both renderers start from this. */
export function layOutDocument(document: PrintDocument, columns: number): LaidOutLine[] {
  return document.flatMap((block) => layOutBlock(block, columns));
}
