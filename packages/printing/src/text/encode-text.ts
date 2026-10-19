import { PRINTING_ERROR_CODES } from "../printing-error-codes";
import { PrintingError } from "../printing-error";
import { asciiFoldCell } from "./ascii-fold";
import { cp1258ByteOf } from "./cp1258-table";
import { toPrintCells } from "./print-cells";

/**
 * - `cp1258`: Windows-1258, for printers that have it: Vietnamese prints with its marks.
 * - `ascii-fold`: marks dropped ("Cà phê đá" → "Ca phe da"), for printers without it. Ugly but
 *   always readable, where a wrong code page prints every accented letter as a stray symbol.
 * Which one a printer gets, and its code page number, is set per printer model.
 */
export type TextScheme = "cp1258" | "ascii-fold";

export interface TextEncoding {
  readonly scheme: TextScheme;
  /**
   * Printed, one for one, for a cell neither scheme can spell (emoji, CJK), so the line keeps
   * its measured width and the reader still sees that something was there.
   */
  readonly replacement: string;
}

export const CP1258: TextEncoding = { scheme: "cp1258", replacement: "?" };
export const ASCII_FOLD: TextEncoding = { scheme: "ascii-fold", replacement: "?" };

/** Circumflex, breve and horn belong to the letter (â ă ơ); Windows-1258 has those precomposed. */
const VOWEL_MODIFIERS = new Set(["\u0302", "\u0306", "\u031b"]);
const TONE_MARKS = new Set(["\u0300", "\u0301", "\u0303", "\u0309", "\u0323"]);

function singleByte(text: string): number | undefined {
  const codePoints = [...text];
  const only = codePoints.length === 1 ? codePoints[0]?.codePointAt(0) : undefined;
  return only === undefined ? undefined : cp1258ByteOf(only);
}

/**
 * The Windows-1258 spelling Windows itself writes: a cell the code page holds whole ("á",
 * "đ", "ô") is that byte; otherwise the letter with its vowel mark, then the tone mark as a
 * combining byte ("ấ" → â + ◌́ = E2 EC). A second tone mark or a mark the code page lacks is
 * dropped, keeping the letter and its first tone, spelled as that pair would be alone. Undefined when even the letter is not in the code page.
 */
function cp1258Cell(cell: string): number[] | undefined {
  const whole = singleByte(cell);
  if (whole !== undefined) return [whole];
  const [base = "", ...marks] = [...cell.normalize("NFD")];
  const letter = (base + marks.filter((m) => VOWEL_MODIFIERS.has(m)).join("")).normalize("NFC");
  const letterByte = singleByte(letter);
  if (letterByte === undefined) return undefined;
  const tone = marks.find((m) => TONE_MARKS.has(m));
  if (tone === undefined) return [letterByte];
  const toned = singleByte((letter + tone).normalize("NFC"));
  if (toned !== undefined) return [toned];
  const toneByte = singleByte(tone);
  return toneByte === undefined ? [letterByte] : [letterByte, toneByte];
}

function assertReplacement(replacement: string): number {
  if (!/^[\x20-\x7e]$/.test(replacement)) {
    throw new PrintingError(
      PRINTING_ERROR_CODES.invalidReplacement,
      "the replacement must be one printable ASCII character",
      { replacement },
    );
  }
  return replacement.charCodeAt(0);
}

/**
 * Text as printer bytes. Never emits a control byte, whatever the input: a product name or a
 * customer note goes straight into the byte stream, and an ESC or GS in it would run as a
 * command (open the drawer, cut, switch the code page for the rest of the slip).
 */
export function encodeText(text: string, encoding: TextEncoding): Uint8Array {
  const replacement = assertReplacement(encoding.replacement);
  const bytes: number[] = [];
  for (const cell of toPrintCells(text)) {
    const spelled = encoding.scheme === "cp1258" ? cp1258Cell(cell) : undefined;
    if (spelled !== undefined) {
      bytes.push(...spelled);
      continue;
    }
    const folded = asciiFoldCell(cell);
    bytes.push(folded === undefined ? replacement : folded.charCodeAt(0));
  }
  return Uint8Array.from(bytes);
}
