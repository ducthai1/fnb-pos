import { type LocalClockParts, type Quantity, QUANTITY_SCALE, formatGrams } from "@fnb/domain";
import type { PrintBlock, PrintDocument } from "../layout/print-document";
import { childIndent, formatQuantity, formatTimeOfDay } from "./format-print-values";
import { PRINT_LABELS_VI as L } from "./print-labels-vi";

export type KitchenTicketLineKind = "new" | "cancel" | "note_changed";

export interface KitchenTicketPrintLine {
  readonly kind: KitchenTicketLineKind;
  readonly name: string;
  /** Units to make, to stop making, or whose note changed. */
  readonly quantity: Quantity;
  /** Sold by weight: the grams to make up (or to stop), printed in place of the units. */
  readonly grams?: number | null;
  readonly note: string | null;
  /** The note the station last saw; only read for `note_changed`. */
  readonly previousNote: string | null;
  /**
   * Toppings and combo picks, per one unit of the item; depth 2 for an option of a pick
   * (1, the default, under the item itself).
   */
  readonly children: readonly {
    readonly name: string;
    readonly quantity: Quantity;
    readonly depth?: number;
  }[];
}

export interface KitchenTicketInput {
  readonly stationName: string;
  readonly orderNumber: string;
  readonly callNumber: string | null;
  readonly tableName: string | null;
  readonly printedAt: LocalClockParts;
  readonly lines: readonly KitchenTicketPrintLine[];
}

/** Cancels first: the station must stop making them before anything else. */
const SECTIONS: readonly { kind: KitchenTicketLineKind; title: string }[] = [
  { kind: "cancel", title: L.sectionCancel },
  { kind: "note_changed", title: L.sectionNoteChanged },
  { kind: "new", title: L.sectionNew },
];

function itemBlocks(line: KitchenTicketPrintLine): PrintBlock[] {
  // A cancel says so on its own line too, so a torn-off piece of the ticket cannot be misread.
  const prefix = line.kind === "cancel" ? `${L.cancelPrefix} ` : "";
  const children = line.children.map((child) => {
    const units = child.quantity === QUANTITY_SCALE ? "" : ` x${formatQuantity(child.quantity)}`;
    return {
      kind: "text",
      text: `+ ${child.name}${units}`,
      indent: childIndent(child.depth),
    } as const;
  });
  const notes: PrintBlock[] =
    line.kind === "note_changed"
      ? [
          { kind: "text", text: `${L.previousNote}: ${line.previousNote ?? L.noNote}`, indent: 2 },
          { kind: "text", text: `${L.newNote}: ${line.note ?? L.noNote}`, indent: 2, bold: true },
        ]
      : line.note === null
        ? []
        : [{ kind: "text", text: `${L.note}: ${line.note}`, indent: 2, bold: true }];
  const units =
    line.grams === undefined || line.grams === null
      ? formatQuantity(line.quantity)
      : formatGrams(line.grams);
  return [
    { kind: "text", text: `${prefix}${units} x ${line.name}`, bold: true },
    ...children,
    ...notes,
  ];
}

/** One ticket for one station (bar, kitchen): what changed on the order since the last one. */
export function buildKitchenTicket(input: KitchenTicketInput): PrintDocument {
  const head: PrintBlock[] = [
    { kind: "text", text: input.stationName, align: "center", bold: true, large: true },
    ...(input.callNumber === null
      ? []
      : [{ kind: "text", text: `${L.callNumber}: ${input.callNumber}`, large: true } as const]),
    ...(input.tableName === null
      ? []
      : [{ kind: "text", text: `${L.table}: ${input.tableName}`, large: true } as const]),
    {
      kind: "columns",
      left: `${L.ticketOrder}: ${input.orderNumber}`,
      right: formatTimeOfDay(input.printedAt),
    },
  ];
  const sections = SECTIONS.flatMap(({ kind, title }) => {
    const lines = input.lines.filter((line) => line.kind === kind);
    if (lines.length === 0) return [];
    return [
      { kind: "rule", char: "=" } as const,
      { kind: "text", text: title, bold: true } as const,
      ...lines.flatMap(itemBlocks),
    ];
  });
  return [...head, ...sections, { kind: "rule", char: "=" }, { kind: "cut" }];
}
