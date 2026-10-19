import { asciiBytes, assertArgumentRange, concatBytes } from "../bytes/bytes";
import { PRINTING_ERROR_CODES } from "../printing-error-codes";
import { PrintingError } from "../printing-error";

const GS = 0x1d;
const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;

export interface Code128Options {
  /** Bar height in dots (GS h). */
  readonly height: number;
  /** Narrow bar width in dots (GS w), 2–6. */
  readonly moduleWidth: number;
  /** Print the readable text under the bars (GS H). */
  readonly showText: boolean;
}

export const DEFAULT_CODE128: Code128Options = { height: 80, moduleWidth: 2, showText: true };

/**
 * GS k 73: CODE128 in code set B. "{" starts a code-set switch in this command, so a literal
 * one is sent as "{{"; the length byte counts the escaped data and the "{B" prefix.
 */
export function printCode128(data: string, options: Code128Options = DEFAULT_CODE128): Uint8Array {
  const escaped = `{B${data.replaceAll("{", "{{")}`;
  if (!PRINTABLE_ASCII.test(data) || escaped.length > 255) {
    throw new PrintingError(
      PRINTING_ERROR_CODES.invalidBarcodeData,
      "CODE128 takes 1 to 253 printable ASCII characters",
      { length: data.length },
    );
  }
  return concatBytes(
    [GS, 0x68, assertArgumentRange("GS h", options.height, 1, 255)],
    [GS, 0x77, assertArgumentRange("GS w", options.moduleWidth, 2, 6)],
    [GS, 0x48, options.showText ? 2 : 0],
    [GS, 0x6b, 73, escaped.length],
    asciiBytes(escaped),
  );
}

export type QrErrorCorrection = "L" | "M" | "Q" | "H";

export interface QrOptions {
  /** Dots per QR module, 1–16. A phone camera reads 4+ reliably on 203 dpi paper. */
  readonly moduleSize: number;
  readonly errorCorrection: QrErrorCorrection;
}

/** M survives a smudge or a fold on thermal paper and still fits a VietQR payload at size 6. */
export const DEFAULT_QR: QrOptions = { moduleSize: 6, errorCorrection: "M" };

/**
 * Byte-mode capacity of the largest symbol (version 40) at error level L; a longer payload
 * cannot become a QR code at all, and printers react to one by printing nothing.
 */
const QR_MAX_BYTES = 2953;
const ERROR_CORRECTION_ARGUMENT: Record<QrErrorCorrection, number> = { L: 48, M: 49, Q: 50, H: 51 };

/** A GS ( k function: cn = 49 (QR), then fn and its parameters, length-prefixed little-endian. */
function qrFunction(fn: number, ...parameters: readonly number[]): number[] {
  const length = parameters.length + 2;
  return [GS, 0x28, 0x6b, length & 0xff, length >> 8, 49, fn, ...parameters];
}

/**
 * Model 2, module size, error level, store the data, print it (GS ( k functions 165, 167, 169,
 * 180, 181). The payloads printed here (an invoice lookup URL, a VietQR EMVCo string) are
 * ASCII by specification, so anything else is refused rather than guessed at.
 */
export function printQrCode(data: string, options: QrOptions = DEFAULT_QR): Uint8Array {
  if (!PRINTABLE_ASCII.test(data) || data.length > QR_MAX_BYTES) {
    throw new PrintingError(
      PRINTING_ERROR_CODES.invalidQrData,
      `a QR payload is 1 to ${QR_MAX_BYTES} printable ASCII characters`,
      { length: data.length },
    );
  }
  const size = assertArgumentRange("GS ( k size", options.moduleSize, 1, 16);
  return concatBytes(
    qrFunction(0x41, 50, 0),
    qrFunction(0x43, size),
    qrFunction(0x45, ERROR_CORRECTION_ARGUMENT[options.errorCorrection]),
    qrFunction(0x50, 48, ...asciiBytes(data)),
    qrFunction(0x51, 48),
  );
}
