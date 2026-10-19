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
export {
  type Label,
  type LabelLine,
  type PlacedLabelLine,
  type TsplProfile,
  labelColumns,
  layOutLabel,
} from "./label/lay-out-label";
export {
  type MoreLinesText,
  renderLabelPreview,
  renderTspl,
  renderTsplChunks,
} from "./label/render-tspl-labels";
export { layOutDocument } from "./layout/lay-out-document";
export {
  type LaidOutLine,
  PAPER_COLUMNS,
  type PaperWidth,
  type PrintBlock,
  type PrintDocument,
} from "./layout/print-document";
export { wrapText } from "./layout/wrap-text";
export { type EscPosProfile, renderEscPos, renderEscPosChunks } from "./render/render-escpos";
export { renderPreview } from "./render/render-preview";
export {
  type BillInput,
  type BillLine,
  type BillLineChild,
  buildBill,
} from "./templates/bill-template";
export { type CupItem, type CupLabelInput, buildCupLabels } from "./templates/cup-label-template";
export {
  type KitchenTicketInput,
  type KitchenTicketLineKind,
  type KitchenTicketPrintLine,
  buildKitchenTicket,
} from "./templates/kitchen-ticket-template";
export { PRINT_LABELS_VI } from "./templates/print-labels-vi";
export {
  type ShiftCloseInput,
  type ShiftCloseMethod,
  buildShiftClose,
} from "./templates/shift-close-template";
export { printedText } from "./text/printed-text";
