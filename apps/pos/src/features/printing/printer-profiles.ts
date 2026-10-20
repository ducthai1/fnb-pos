import { ASCII_FOLD, DEFAULT_QR, type EscPosProfile, type TsplProfile } from "@fnb/printing";

/*
 * Until printers are set up per till, slips are rendered for a generic 80 mm receipt
 * printer and a 40 × 30 mm cup sticker printer. Both fold Vietnamese to plain letters:
 * Windows-1258 needs the model's code page number, which only the printer's setup knows,
 * and a wrong number prints every accented letter as another symbol. The on-screen preview
 * shows the slip in full Vietnamese.
 */

export const RECEIPT_PRINTER: EscPosProfile = {
  paper: "80mm",
  encoding: ASCII_FOLD,
  codePage: null,
  cut: { partial: true, feedLines: 3 },
  qr: DEFAULT_QR,
};

export const CUP_LABEL_PRINTER: TsplProfile = {
  widthMm: 40,
  heightMm: 30,
  gapMm: 2,
  dotsPerMm: 8,
  marginDots: 10,
  font: { name: "2", widthDots: 12, heightDots: 20 },
  lineGapDots: 4,
  encoding: ASCII_FOLD,
  codePage: null,
};

export const PRINTER_KEYS = {
  receipt: "receipt",
  cupLabel: "cup_label",
  station: (stationId: string) => `station:${stationId}`,
} as const;
