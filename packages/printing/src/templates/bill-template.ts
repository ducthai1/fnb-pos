import {
  type BasisPoints,
  type LocalClockParts,
  type Quantity,
  QUANTITY_SCALE,
  type Vnd,
  formatVnd,
  negateVnd,
} from "@fnb/domain";
import type { PrintBlock, PrintDocument } from "../layout/print-document";
import { formatClock, formatQuantity, formatRate } from "./format-print-values";
import { PRINT_LABELS_VI as L } from "./print-labels-vi";

export interface BillLineChild {
  /** A topping, a size or a pick inside a combo. */
  readonly name: string;
  /** Per one unit of the item, as on the order line. */
  readonly quantity: Quantity;
  /** What it adds to the line, or null when it is free and shown for the barista's sake. */
  readonly amount: Vnd | null;
}

export interface BillLine {
  readonly name: string;
  readonly quantity: Quantity;
  readonly unitPrice: Vnd;
  readonly amount: Vnd;
  readonly children: readonly BillLineChild[];
  readonly note: string | null;
}

/**
 * Every amount comes from the domain (computeOrderTotals and the payment); the template only
 * places it. A slip that added up its own numbers could disagree with the order it prints.
 */
export interface BillInput {
  readonly shop: {
    readonly name: string;
    readonly address: string | null;
    readonly phone: string | null;
  };
  readonly orderNumber: string;
  readonly callNumber: string | null;
  readonly tableName: string | null;
  readonly cashierName: string | null;
  readonly printedAt: LocalClockParts;
  readonly lines: readonly BillLine[];
  readonly subtotal: Vnd;
  /** Each as the positive amount it takes off. */
  readonly discounts: readonly { readonly label: string; readonly amount: Vnd }[];
  readonly serviceCharge: Vnd | null;
  readonly pricesIncludeTax: boolean;
  readonly taxes: readonly { readonly rate: BasisPoints; readonly amount: Vnd }[];
  readonly total: Vnd;
  readonly payments: readonly { readonly method: string; readonly amount: Vnd }[];
  readonly change: Vnd;
  /** The e-invoice lookup code and its URL, printed as text and as a QR code. */
  readonly lookup: { readonly code: string; readonly url: string } | null;
  readonly footer: string | null;
}

type ColumnsBlock = Extract<PrintBlock, { kind: "columns" }>;

const pair = (left: string, right: string, style: Pick<ColumnsBlock, "bold" | "indent"> = {}) =>
  ({ kind: "columns", left, right, ...style }) satisfies ColumnsBlock;

function header(input: BillInput): PrintBlock[] {
  const { shop } = input;
  return [
    { kind: "text", text: shop.name, align: "center", bold: true },
    ...(shop.address === null
      ? []
      : [{ kind: "text", text: shop.address, align: "center" } as const]),
    ...(shop.phone === null
      ? []
      : [{ kind: "text", text: `${L.phone}: ${shop.phone}`, align: "center" } as const]),
    { kind: "blank" },
    { kind: "text", text: L.billTitle, align: "center", bold: true },
    pair(`${L.orderNumber}: ${input.orderNumber}`, formatClock(input.printedAt)),
    ...(input.callNumber === null
      ? []
      : [{ kind: "text", text: `${L.callNumber}: ${input.callNumber}`, large: true } as const]),
    ...(input.tableName === null
      ? []
      : [{ kind: "text", text: `${L.table}: ${input.tableName}` } as const]),
    ...(input.cashierName === null
      ? []
      : [{ kind: "text", text: `${L.cashier}: ${input.cashierName}` } as const]),
    { kind: "rule", char: "-" },
  ];
}

function lineBlocks(line: BillLine): PrintBlock[] {
  const qty = `${formatQuantity(line.quantity)} x ${formatVnd(line.unitPrice)}`;
  return [
    { kind: "text", text: line.name, bold: true },
    pair(qty, formatVnd(line.amount), { indent: 2 }),
    ...line.children.map((child) => {
      const units = child.quantity === QUANTITY_SCALE ? "" : ` x${formatQuantity(child.quantity)}`;
      const name = `+ ${child.name}${units}`;
      return child.amount === null
        ? ({ kind: "text", text: name, indent: 2 } as const)
        : pair(name, formatVnd(child.amount), { indent: 2 });
    }),
    ...(line.note === null
      ? []
      : [{ kind: "text", text: `${L.note}: ${line.note}`, indent: 2 } as const]),
  ];
}

function summary(input: BillInput): PrintBlock[] {
  const taxLabel = input.pricesIncludeTax ? L.taxIncluded : L.taxAdded;
  return [
    pair(L.subtotal, formatVnd(input.subtotal)),
    ...input.discounts.map((d) => pair(d.label, formatVnd(negateVnd(d.amount)))),
    ...(input.serviceCharge === null
      ? []
      : [pair(L.serviceCharge, formatVnd(input.serviceCharge))]),
    ...input.taxes.map((t) => pair(`${taxLabel} ${formatRate(t.rate)}`, formatVnd(t.amount))),
    { kind: "rule", char: "=" },
    pair(L.total, formatVnd(input.total), { bold: true }),
    { kind: "rule", char: "-" },
    ...input.payments.map((p) => pair(p.method, formatVnd(p.amount))),
    ...(input.change === 0n ? [] : [pair(L.change, formatVnd(input.change))]),
  ];
}

function closing(input: BillInput): PrintBlock[] {
  const lookup: PrintBlock[] =
    input.lookup === null
      ? []
      : [
          { kind: "blank" },
          { kind: "text", text: `${L.lookupCode}: ${input.lookup.code}`, align: "center" },
          { kind: "qr", data: input.lookup.url },
        ];
  const footer: PrintBlock[] =
    input.footer === null
      ? []
      : [{ kind: "blank" }, { kind: "text", text: input.footer, align: "center" }];
  return [...lookup, ...footer, { kind: "cut" }];
}

export function buildBill(input: BillInput): PrintDocument {
  return [
    ...header(input),
    ...input.lines.flatMap(lineBlocks),
    { kind: "rule", char: "-" },
    ...summary(input),
    ...closing(input),
  ];
}
