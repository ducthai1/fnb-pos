import { cp1258CodePointOf } from "./cp1258-table";
import { type TextEncoding, encodeText } from "./encode-text";

/**
 * The text as the printer will show it under an encoding: folded letters, replacement
 * characters and all. Previews use it so a cashier sees "Tra dao ?" before the slip says so.
 * Both schemes' bytes read back through the Windows-1258 table (ASCII is its lower half).
 */
export function printedText(text: string, encoding: TextEncoding): string {
  const codePoints = Array.from(encodeText(text, encoding), (b) => cp1258CodePointOf(b) ?? 0x3f);
  return String.fromCodePoint(...codePoints).normalize("NFC");
}
