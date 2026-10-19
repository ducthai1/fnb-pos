import { toPrintCells } from "../text/print-cells";

const LINE_BREAK = /\r\n|[\n\r\v\f\u0085\u2028\u2029]/u;

function joinCells(cells: readonly string[]): string {
  return cells.join("");
}

/** Splits a run of cells longer than the line into line-sized pieces, keeping marks on letters. */
function hardBreak(word: readonly string[], width: number): string[][] {
  const pieces: string[][] = [];
  for (let i = 0; i < word.length; i += width) pieces.push(word.slice(i, i + width));
  return pieces;
}

function wrapParagraph(paragraph: string, width: number): string[] {
  const words: string[][] = [];
  let current: string[] = [];
  for (const cell of toPrintCells(paragraph)) {
    if (cell !== " ") {
      current.push(cell);
    } else if (current.length > 0) {
      words.push(current);
      current = [];
    }
  }
  if (current.length > 0) words.push(current);

  const lines: string[] = [];
  let line: string[] = [];
  for (const word of words) {
    const fits = line.length === 0 ? word.length <= width : line.length + 1 + word.length <= width;
    if (fits) {
      line = line.length === 0 ? [...word] : [...line, " ", ...word];
      continue;
    }
    if (line.length > 0) lines.push(joinCells(line));
    // A name of 80 letters without a space (a pasted code, a long brand) still has to print
    // whole, so it is cut at the margin rather than run off the paper.
    const pieces = hardBreak(word, width);
    line = pieces.pop() ?? [];
    lines.push(...pieces.map(joinCells));
  }
  if (line.length > 0 || lines.length === 0) lines.push(joinCells(line));
  return lines;
}

/**
 * Word-wraps text to lines of at most `width` print cells. Line breaks in the text (a note
 * typed on several lines) are kept, an empty line included; runs of spaces collapse to one.
 */
export function wrapText(text: string, width: number): string[] {
  const safeWidth = Math.max(1, width);
  return text.split(LINE_BREAK).flatMap((paragraph) => wrapParagraph(paragraph, safeWidth));
}
