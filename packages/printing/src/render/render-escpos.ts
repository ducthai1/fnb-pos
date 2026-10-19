import { concatBytes } from "../bytes/bytes";
import { type QrOptions, printQrCode } from "../escpos/escpos-codes";
import {
  type CutOptions,
  cutPaper,
  initializePrinter,
  lineFeed,
  selectCodePage,
  setAlignment,
  setBold,
  setTextSize,
} from "../escpos/escpos-commands";
import { layOutDocument } from "../layout/lay-out-document";
import { PAPER_COLUMNS, type PaperWidth, type PrintDocument } from "../layout/print-document";
import { PRINTING_ERROR_CODES } from "../printing-error-codes";
import { PrintingError } from "../printing-error";
import { type TextEncoding, encodeText } from "../text/encode-text";

/** What differs between receipt printers; set per printer model in the branch's settings. */
export interface EscPosProfile {
  readonly paper: PaperWidth;
  readonly encoding: TextEncoding;
  /**
   * ESC t number of Windows-1258 on this model. Required with `cp1258`: without it the printer
   * keeps its default page and every accented byte prints as some other symbol.
   */
  readonly codePage: number | null;
  readonly cut: CutOptions;
  readonly qr: QrOptions;
}

/**
 * The slip as ESC/POS, one chunk per printed line (plus the setup chunk first), so a golden
 * file can show which bytes made which line. Style commands are sent only when a line's style
 * differs from the line before.
 */
export function renderEscPosChunks(document: PrintDocument, profile: EscPosProfile): Uint8Array[] {
  if (profile.encoding.scheme === "cp1258" && profile.codePage === null) {
    throw new PrintingError(
      PRINTING_ERROR_CODES.codePageRequired,
      "Windows-1258 text needs the printer's code page number",
    );
  }
  const setup = profile.codePage === null ? [] : selectCodePage(profile.codePage);
  const chunks = [concatBytes(initializePrinter(), setup)];
  let bold = false;
  let large = false;
  for (const line of layOutDocument(document, PAPER_COLUMNS[profile.paper])) {
    if (line.kind === "cut") {
      chunks.push(cutPaper(profile.cut));
      continue;
    }
    if (line.kind === "qr") {
      const qr = printQrCode(line.data, profile.qr);
      chunks.push(concatBytes(setAlignment("center"), qr, lineFeed(), setAlignment("left")));
      continue;
    }
    const style: Uint8Array[] = [];
    if (line.bold !== bold) style.push(setBold(line.bold));
    if (line.large !== large) style.push(line.large ? setTextSize(2, 2) : setTextSize(1, 1));
    bold = line.bold;
    large = line.large;
    chunks.push(concatBytes(...style, encodeText(line.text, profile.encoding), lineFeed()));
  }
  return chunks;
}

export function renderEscPos(document: PrintDocument, profile: EscPosProfile): Uint8Array {
  return concatBytes(...renderEscPosChunks(document, profile));
}
