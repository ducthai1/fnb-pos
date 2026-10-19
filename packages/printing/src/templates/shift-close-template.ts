import {
  type LocalClockParts,
  type Vnd,
  ZERO_VND,
  addVnd,
  formatVnd,
  subtractVnd,
} from "@fnb/domain";
import type { PrintBlock, PrintDocument } from "../layout/print-document";
import { formatClock, formatSignedVnd } from "./format-print-values";
import { PRINT_LABELS_VI as L } from "./print-labels-vi";

export interface ShiftCloseMethod {
  readonly method: string;
  /** What the till recorded for this payment method during the shift. */
  readonly expected: Vnd;
  /** What the cashier counted or read off the bank, or null when it was not counted. */
  readonly counted: Vnd | null;
}

export interface ShiftCloseInput {
  readonly shopName: string;
  readonly staffName: string;
  readonly openedAt: LocalClockParts;
  readonly closedAt: LocalClockParts;
  readonly methods: readonly ShiftCloseMethod[];
}

/**
 * The difference is worked out here, with the money functions, rather than passed in: the
 * slip must not be able to show a difference that disagrees with the two amounts above it.
 * A method left uncounted has no difference, and is left out of the total difference.
 */
export function buildShiftClose(input: ShiftCloseInput): PrintDocument {
  const differences: Vnd[] = [];
  const methods = input.methods.flatMap((m): PrintBlock[] => {
    const counted = m.counted === null ? L.notCounted : formatVnd(m.counted);
    const difference = m.counted === null ? null : subtractVnd(m.counted, m.expected);
    if (difference !== null) differences.push(difference);
    return [
      { kind: "text", text: m.method, bold: true },
      { kind: "columns", left: L.expected, right: formatVnd(m.expected), indent: 2 },
      { kind: "columns", left: L.counted, right: counted, indent: 2 },
      ...(difference === null
        ? []
        : [
            {
              kind: "columns",
              left: L.difference,
              right: formatSignedVnd(difference),
              indent: 2,
            } as const,
          ]),
    ];
  });
  const expectedTotal = addVnd(ZERO_VND, ...input.methods.map((m) => m.expected));
  const differenceTotal = addVnd(ZERO_VND, ...differences);
  return [
    { kind: "text", text: input.shopName, align: "center", bold: true },
    { kind: "text", text: L.shiftCloseTitle, align: "center", bold: true },
    { kind: "text", text: `${L.staff}: ${input.staffName}` },
    { kind: "columns", left: L.shiftOpened, right: formatClock(input.openedAt) },
    { kind: "columns", left: L.shiftClosed, right: formatClock(input.closedAt) },
    { kind: "rule", char: "=" },
    ...methods,
    { kind: "rule", char: "=" },
    { kind: "columns", left: L.expectedTotal, right: formatVnd(expectedTotal), bold: true },
    {
      kind: "columns",
      left: L.differenceTotal,
      right: formatSignedVnd(differenceTotal),
      bold: true,
    },
    { kind: "blank" },
    { kind: "text", text: `${L.signature}:` },
    { kind: "blank" },
    { kind: "blank" },
    { kind: "cut" },
  ];
}
