import { assertArgumentRange } from "../bytes/bytes";

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export type Alignment = "left" | "center" | "right";

/** ESC @: clears styles and the code page left by the previous job, which may not be ours. */
export function initializePrinter(): Uint8Array {
  return Uint8Array.of(ESC, 0x40);
}

/**
 * ESC t n. The number of a code page differs per printer model (Windows-1258 is 52 on some,
 * 94 on others, absent on many), so it always comes from the printer's profile.
 */
export function selectCodePage(page: number): Uint8Array {
  return Uint8Array.of(ESC, 0x74, assertArgumentRange("ESC t", page, 0, 255));
}

const ALIGNMENT_ARGUMENT: Record<Alignment, number> = { left: 0, center: 1, right: 2 };

/** ESC a n */
export function setAlignment(alignment: Alignment): Uint8Array {
  return Uint8Array.of(ESC, 0x61, ALIGNMENT_ARGUMENT[alignment]);
}

/** ESC E n */
export function setBold(on: boolean): Uint8Array {
  return Uint8Array.of(ESC, 0x45, on ? 1 : 0);
}

/** GS ! n: width and height multipliers 1–8, packed as two nibbles of (multiplier − 1). */
export function setTextSize(width: number, height: number): Uint8Array {
  const w = assertArgumentRange("GS ! width", width, 1, 8);
  const h = assertArgumentRange("GS ! height", height, 1, 8);
  return Uint8Array.of(GS, 0x21, ((w - 1) << 4) | (h - 1));
}

export function lineFeed(): Uint8Array {
  return Uint8Array.of(LF);
}

/** ESC d n */
export function feedLines(lines: number): Uint8Array {
  return Uint8Array.of(ESC, 0x64, assertArgumentRange("ESC d", lines, 0, 255));
}

export interface CutOptions {
  /** A partial cut leaves a hinge so the slip does not fall on the floor; not every cutter has one. */
  readonly partial: boolean;
  /**
   * The cutter sits a few lines above the print head, so the last lines would be cut through
   * without feeding past them first.
   */
  readonly feedLines: number;
}

/** GS V m n with m = 65 (full) or 66 (partial): feed n lines, then cut. */
export function cutPaper(options: CutOptions): Uint8Array {
  const feed = assertArgumentRange("GS V", options.feedLines, 0, 255);
  return Uint8Array.of(GS, 0x56, options.partial ? 66 : 65, feed);
}

export interface DrawerPulse {
  /** Drawer kick connector pin: 2 (m = 0) or 5 (m = 1); a second drawer is wired to pin 5. */
  readonly pin: 2 | 5;
  /** ESC p counts time in 2 ms steps; asking for 51 ms gets 52 ms, never less than asked. */
  readonly onMs: number;
  readonly offMs: number;
}

/** 50 ms on, 500 ms off: long enough for the common solenoids, short enough not to burn them. */
export const DEFAULT_DRAWER_PULSE: DrawerPulse = { pin: 2, onMs: 50, offMs: 500 };

/** ESC p m t1 t2 */
export function openCashDrawer(pulse: DrawerPulse = DEFAULT_DRAWER_PULSE): Uint8Array {
  const on = assertArgumentRange("ESC p on", Math.ceil(pulse.onMs / 2), 1, 255);
  const off = assertArgumentRange("ESC p off", Math.ceil(pulse.offMs / 2), 1, 255);
  return Uint8Array.of(ESC, 0x70, pulse.pin === 2 ? 0 : 1, on, off);
}
