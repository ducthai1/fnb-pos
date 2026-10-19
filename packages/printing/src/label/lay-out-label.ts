import { wrapText } from "../layout/wrap-text";
import type { TextEncoding } from "../text/encode-text";

export interface LabelLine {
  readonly text: string;
  /** Double width and height. */
  readonly large?: boolean;
}

/** One sticker; a cup label holds one cup. */
export type Label = readonly LabelLine[];

/** What differs between label printers and label rolls; set per printer in the branch's settings. */
export interface TsplProfile {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly gapMm: number;
  /** 8 at 203 dpi, 12 at 300 dpi. */
  readonly dotsPerMm: number;
  readonly marginDots: number;
  /** The font and the size of one character cell in it, in dots. */
  readonly font: { readonly name: string; readonly widthDots: number; readonly heightDots: number };
  readonly lineGapDots: number;
  readonly encoding: TextEncoding;
  /** CODEPAGE value for Windows-1258 on this model, or null to leave the printer's default. */
  readonly codePage: string | null;
}

export interface PlacedLabelLine {
  readonly text: string;
  readonly large: boolean;
  readonly x: number;
  readonly y: number;
}

/** Characters per line of the label in normal size. */
export function labelColumns(profile: TsplProfile): number {
  const usable = Math.floor(profile.widthMm * profile.dotsPerMm) - 2 * profile.marginDots;
  return Math.max(1, Math.floor(usable / profile.font.widthDots));
}

/**
 * Wraps and places a label's lines top to bottom. A sticker cannot grow, so lines that do not
 * fit are not printed; the last line that does fit says how many are missing instead, so the
 * barista knows to read the rest on the screen rather than make the drink without them.
 */
export function layOutLabel(
  label: Label,
  profile: TsplProfile,
  moreLines: (hidden: number) => string,
): PlacedLabelLine[] {
  const columns = labelColumns(profile);
  const wrapped = label.flatMap((line) => {
    const large = line.large ?? false;
    return wrapText(line.text, large ? Math.floor(columns / 2) : columns).map((text) => ({
      text,
      large,
    }));
  });
  const bottom = Math.floor(profile.heightMm * profile.dotsPerMm) - profile.marginDots;
  const heightOf = (large: boolean) => profile.font.heightDots * (large ? 2 : 1);
  const placed: PlacedLabelLine[] = [];
  let y = profile.marginDots;
  for (const line of wrapped) {
    if (y + heightOf(line.large) > bottom) {
      // The marker takes the place of the last line that fit, so it always has room.
      const last = placed.pop();
      const hidden = wrapped.length - placed.length;
      const markerY = last?.y ?? profile.marginDots;
      placed.push({ text: moreLines(hidden), large: false, x: profile.marginDots, y: markerY });
      return placed;
    }
    placed.push({ ...line, x: profile.marginDots, y });
    y += heightOf(line.large) + profile.lineGapDots;
  }
  return placed;
}
