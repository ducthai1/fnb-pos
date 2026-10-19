import { PRINTING_ERROR_CODES } from "../printing-error-codes";
import { PrintingError } from "../printing-error";

export type ByteChunk = Uint8Array | readonly number[];

export function concatBytes(...chunks: readonly ByteChunk[]): Uint8Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Bytes of a string that is ASCII by construction (command words, numbers). */
export function asciiBytes(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => char.charCodeAt(0) & 0x7f);
}

/** "1b 40 0a", 16 bytes per line: how golden files and test failures show bytes. */
export function toHex(bytes: Uint8Array, bytesPerLine = 16): string {
  const pairs = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  const lines: string[] = [];
  for (let i = 0; i < pairs.length; i += bytesPerLine) {
    lines.push(pairs.slice(i, i + bytesPerLine).join(" "));
  }
  return lines.join("\n");
}

export function fromHex(hex: string): Uint8Array {
  const pairs = hex.split(/\s+/).filter((pair) => pair !== "");
  return Uint8Array.from(pairs, (pair) => {
    if (!/^[0-9a-fA-F]{2}$/.test(pair)) {
      throw new PrintingError(PRINTING_ERROR_CODES.invalidHex, `not a hex byte: ${pair}`);
    }
    return Number.parseInt(pair, 16);
  });
}

/**
 * Every numeric argument of a printer command is one byte with a narrower legal range; a
 * value outside it would be sent anyway by a careless `& 0xff` and change what the printer does.
 */
export function assertArgumentRange(
  command: string,
  value: number,
  min: number,
  max: number,
): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new PrintingError(
      PRINTING_ERROR_CODES.argumentOutOfRange,
      `${command}: ${value} is outside ${min}..${max}`,
      { command, value, min, max },
    );
  }
  return value;
}
