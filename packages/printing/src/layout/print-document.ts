import type { Alignment } from "../escpos/escpos-commands";

/**
 * What a slip says, independent of the printer: templates build it, and each renderer (ESC/POS
 * bytes, text preview) lays it out the same way, so the preview a cashier sees is the slip.
 */
export type PrintBlock =
  | {
      readonly kind: "text";
      readonly text: string;
      readonly align?: Alignment;
      readonly bold?: boolean;
      /** Double width and height: a call number read from across the counter. */
      readonly large?: boolean;
      /** Columns of indent on every line, for toppings under their item. */
      readonly indent?: number;
    }
  | {
      readonly kind: "columns";
      readonly left: string;
      /** Right-aligned on the first line of `left`: amounts line up whatever the name's length. */
      readonly right: string;
      readonly bold?: boolean;
      readonly indent?: number;
    }
  | { readonly kind: "rule"; readonly char: "-" | "=" }
  | { readonly kind: "blank" }
  | { readonly kind: "qr"; readonly data: string }
  | { readonly kind: "cut" };

export type PrintDocument = readonly PrintBlock[];

export type PaperWidth = "58mm" | "80mm";

/** Characters per line in the printer's standard font (12×24 dots). */
export const PAPER_COLUMNS: Readonly<Record<PaperWidth, number>> = { "58mm": 32, "80mm": 48 };

/** One printed line after wrapping: text already padded to its place on the line. */
export type LaidOutLine =
  | {
      readonly kind: "text";
      readonly text: string;
      readonly bold: boolean;
      readonly large: boolean;
    }
  | { readonly kind: "qr"; readonly data: string }
  | { readonly kind: "cut" };
