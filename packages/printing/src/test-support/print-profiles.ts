import { DEFAULT_QR } from "../escpos/escpos-codes";
import type { TsplProfile } from "../label/lay-out-label";
import type { PaperWidth } from "../layout/print-document";
import type { EscPosProfile } from "../render/render-escpos";
import { ASCII_FOLD, CP1258 } from "../text/encode-text";

/** A receipt printer with Windows-1258 at ESC t 30 (the number is made up: it varies by model). */
export function cp1258Printer(paper: PaperWidth): EscPosProfile {
  return {
    paper,
    encoding: CP1258,
    codePage: 30,
    cut: { partial: true, feedLines: 3 },
    qr: DEFAULT_QR,
  };
}

export function asciiPrinter(paper: PaperWidth): EscPosProfile {
  return { ...cp1258Printer(paper), encoding: ASCII_FOLD, codePage: null };
}

/** A 40 × 30 mm cup sticker at 203 dpi in the 12 × 20 dot font: 25 columns, 9 lines. */
export const CUP_LABEL_PRINTER: TsplProfile = {
  widthMm: 40,
  heightMm: 30,
  gapMm: 2,
  dotsPerMm: 8,
  marginDots: 10,
  font: { name: "2", widthDots: 12, heightDots: 20 },
  lineGapDots: 4,
  encoding: CP1258,
  codePage: "1258",
};
