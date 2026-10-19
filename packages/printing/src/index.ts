export { type ByteChunk, concatBytes, fromHex, toHex } from "./bytes/bytes";
export {
  type Code128Options,
  DEFAULT_CODE128,
  DEFAULT_QR,
  type QrErrorCorrection,
  type QrOptions,
  printCode128,
  printQrCode,
} from "./escpos/escpos-codes";
export {
  type Alignment,
  type CutOptions,
  DEFAULT_DRAWER_PULSE,
  type DrawerPulse,
  cutPaper,
  feedLines,
  initializePrinter,
  lineFeed,
  openCashDrawer,
  selectCodePage,
  setAlignment,
  setBold,
  setTextSize,
} from "./escpos/escpos-commands";
export { PRINTING_ERROR_CODES } from "./printing-error-codes";
export { PrintingError, isPrintingError } from "./printing-error";
export {
  ASCII_FOLD,
  CP1258,
  type TextEncoding,
  type TextScheme,
  encodeText,
} from "./text/encode-text";
export { printWidth, toPrintCells } from "./text/print-cells";
export {
  type TsplQrOptions,
  type TsplTextOptions,
  tsplClear,
  tsplCodePage,
  tsplGap,
  tsplPrint,
  tsplQrCode,
  tsplSize,
  tsplText,
} from "./tspl/tspl-commands";
