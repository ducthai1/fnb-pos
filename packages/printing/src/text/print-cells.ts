/**
 * Splits text into print cells: one base character with the combining marks that sit on it.
 * A printer that knows Vietnamese draws a tone mark over the letter before it, so a cell is
 * one column on paper however many bytes it takes; widths and line breaks count cells, and a
 * break never separates a letter from its tone mark.
 *
 * - The text is NFC-normalized first, so "ấ" typed as a + ◌̂ + ◌́ and as U+1EA5 are one cell.
 * - Tabs, line and paragraph separators become a space: line breaks are the layout's business,
 *   and a control byte in a name or a note (ESC, GS) would be read by the printer as a command.
 * - Every other control and format character (zero-width joiners, emoji variation selectors,
 *   bidi marks) and emoji skin-tone modifiers are dropped: none has a width of its own, and
 *   none has a glyph on a receipt printer.
 * - A combining mark with no base before it is dropped too.
 */
export function toPrintCells(text: string): string[] {
  const cells: string[] = [];
  for (const char of text.normalize("NFC")) {
    if (/[\t\n\v\f\r\u0085\u2028\u2029]/u.test(char)) {
      cells.push(" ");
    } else if (/[\p{Cc}\p{Cf}\p{Emoji_Modifier}\p{Variation_Selector}]/u.test(char)) {
      continue;
    } else if (/\p{M}/u.test(char)) {
      if (cells.length > 0 && cells[cells.length - 1] !== " ") cells[cells.length - 1] += char;
    } else {
      cells.push(char);
    }
  }
  return cells;
}

/** Columns the text takes on paper. */
export function printWidth(text: string): number {
  return toPrintCells(text).length;
}
