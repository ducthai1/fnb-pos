import { asciiBytes, assertArgumentRange, concatBytes } from "../bytes/bytes";
import { PRINTING_ERROR_CODES } from "../printing-error-codes";
import { PrintingError } from "../printing-error";
import { type TextEncoding, encodeText } from "../text/encode-text";

const CRLF = "\r\n";
const QUOTE = 0x22;
const BACKSLASH = 0x5c;
/** TSPL's escape for a double quote inside a quoted string. */
const ESCAPED_QUOTE = asciiBytes('\\["]');

function command(text: string): Uint8Array {
  return asciiBytes(`${text}${CRLF}`);
}

/** Label sizes in millimetres, to 0.1 mm: what the label roll says, and what TSPL accepts. */
function millimetres(command: string, value: number, min: number): string {
  const tenths = Math.round(value * 10);
  assertArgumentRange(command, tenths, min * 10, 2000);
  return `${tenths / 10} mm`;
}

/** SIZE w mm,h mm */
export function tsplSize(widthMm: number, heightMm: number): Uint8Array {
  return command(`SIZE ${millimetres("SIZE", widthMm, 1)},${millimetres("SIZE", heightMm, 1)}`);
}

/** GAP g mm,o mm: the gap between labels, and its offset; both 0 on continuous paper. */
export function tsplGap(gapMm: number, offsetMm = 0): Uint8Array {
  return command(`GAP ${millimetres("GAP", gapMm, 0)},${millimetres("GAP", offsetMm, 0)}`);
}

/** Named per printer model ("1258", "UTF-8"…), so it is checked to be a bare word, not quoted. */
export function tsplCodePage(name: string): Uint8Array {
  if (!/^[A-Za-z0-9-]{1,16}$/.test(name)) {
    throw new PrintingError(PRINTING_ERROR_CODES.invalidCodePageName, `bad code page: ${name}`);
  }
  return command(`CODEPAGE ${name}`);
}

/** CLS: clears the image buffer, or the previous label's text prints under this one. */
export function tsplClear(): Uint8Array {
  return command("CLS");
}

/**
 * A quoted TSPL string, with a quote escaped. A backslash starts TSPL's own escapes ("\[R]"…),
 * so text gets the replacement character for it; a QR payload refuses it instead, since a
 * changed character would send a payment to the wrong place.
 */
function quoted(bytes: Uint8Array, backslash: number): Uint8Array {
  const out: number[] = [QUOTE];
  for (const b of bytes) {
    if (b === QUOTE) out.push(...ESCAPED_QUOTE);
    else out.push(b === BACKSLASH ? backslash : b);
  }
  out.push(QUOTE);
  return Uint8Array.from(out);
}

export interface TsplTextOptions {
  readonly x: number;
  readonly y: number;
  /** Built-in fonts are "1".."8"; downloaded ones have file names ("TSS24.BF2"). */
  readonly font: string;
  /** Magnification 1–10 along each axis. */
  readonly xScale: number;
  readonly yScale: number;
}

function assertFont(font: string): string {
  if (!/^[A-Za-z0-9._-]{1,32}$/.test(font)) {
    throw new PrintingError(PRINTING_ERROR_CODES.invalidFontName, `bad font name: ${font}`);
  }
  return font;
}

function dots(name: string, value: number): number {
  return assertArgumentRange(name, value, 0, 9999);
}

/** TEXT x,y,"font",0,xs,ys,"content" */
export function tsplText(
  text: string,
  options: TsplTextOptions,
  encoding: TextEncoding,
): Uint8Array {
  const head =
    `TEXT ${dots("TEXT x", options.x)},${dots("TEXT y", options.y)},` +
    `"${assertFont(options.font)}",0,${assertArgumentRange("TEXT x-scale", options.xScale, 1, 10)},` +
    `${assertArgumentRange("TEXT y-scale", options.yScale, 1, 10)},`;
  return concatBytes(
    asciiBytes(head),
    quoted(encodeText(text, encoding), encoding.replacement.charCodeAt(0)),
    command(""),
  );
}

export interface TsplQrOptions {
  readonly x: number;
  readonly y: number;
  readonly errorCorrection: "L" | "M" | "Q" | "H";
  /** Dots per module, 1–10. */
  readonly cellWidth: number;
}

/** QRCODE x,y,ECC,cell,A,0,"data": ASCII payloads only, as with ESC/POS. */
export function tsplQrCode(data: string, options: TsplQrOptions): Uint8Array {
  if (!/^[\x20-\x5b\x5d-\x7e]{1,2953}$/.test(data)) {
    throw new PrintingError(
      PRINTING_ERROR_CODES.invalidQrData,
      "a QR payload is printable ASCII without a backslash",
      {
        length: data.length,
      },
    );
  }
  const head =
    `QRCODE ${dots("QRCODE x", options.x)},${dots("QRCODE y", options.y)},` +
    `${options.errorCorrection},${assertArgumentRange("QRCODE cell", options.cellWidth, 1, 10)},A,0,`;
  return concatBytes(asciiBytes(head), quoted(asciiBytes(data), BACKSLASH), command(""));
}

/** PRINT sets,copies */
export function tsplPrint(sets = 1, copies = 1): Uint8Array {
  const s = assertArgumentRange("PRINT sets", sets, 1, 999);
  return command(`PRINT ${s},${assertArgumentRange("PRINT copies", copies, 1, 999)}`);
}
