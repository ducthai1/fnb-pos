import { type EntitySnapshot, posChargeProfileSchema } from "@fnb/contracts";
import {
  type Order,
  type OrderChargeProfile,
  type OrderLine,
  type OrderStatus,
  type RefundAmounts,
  type SentLineState,
  type ServiceType,
  type Vnd,
  basisPoints,
  quantity,
  vnd,
} from "@fnb/domain";

/** An order row the till holds (its own expectation or the server's), every field read. */
export interface StoredOrder {
  readonly orderId: string;
  /** The till that opened the order, whose number it carries. */
  readonly deviceId: string;
  readonly deviceOrderNo: number;
  readonly status: OrderStatus;
  readonly serviceType: ServiceType;
  readonly tableTag: string | null;
  readonly businessDate: string;
  readonly version: number;
  readonly tableId: string | null;
  readonly tableName: string | null;
  readonly preBillPrinted: boolean;
  /** The version the last pre-bill showed; null for none, or a server that does not say. */
  readonly preBillPrintedVersion: number | null;
  /** When the guests' order was opened, as the server stamped it; null in a copy without it. */
  readonly openedAt: string | null;
  /** Why a draft was cancelled or a sale refunded. */
  readonly reasonCode: string | null;
  readonly chargeProfile: OrderChargeProfile;
  /** Every line as stored, prices included: what the server keeps for lines it locked. */
  readonly lines: readonly OrderLine[];
  /** What the stations were shown of each root item. */
  readonly sent: readonly SentLineState[];
  /** The sale a refund gives back part of; null for a sale. */
  readonly refundOfOrderId: string | null;
  readonly refundAmounts: RefundAmounts | null;
  readonly payments: readonly { readonly method: string; readonly amount: Vnd }[];
  /**
   * The till's own expectation, its commands still waiting: a cancel line in it carries the
   * id the till made, which the server (making its own) will not know. Set by the reader's
   * caller, which sees where the row came from.
   */
  readonly heldOnTill?: boolean;
}

type Row = Record<string, unknown>;
const STATUSES: readonly string[] = ["draft", "paid", "posted", "cancelled"];
const SERVICE_TYPES: readonly string[] = [
  "dine_in",
  "takeaway",
  "delivery_self",
  "delivery_platform",
];
const LINE_TYPES: readonly string[] = ["item", "modifier", "combo_component", "discount"];
const SOURCES: readonly string[] = ["base", "price_list", "manual", "promotion"];

const str = (row: Row, key: string): string => {
  const value = row[key];
  if (typeof value !== "string") throw new TypeError(`${key} is not text`);
  return value;
};
const strOrNull = (row: Row, key: string): string | null =>
  row[key] === null || row[key] === undefined ? null : str(row, key);
const num = (row: Row, key: string): number => {
  const value = row[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new TypeError(key);
  return value;
};
const money = (row: Row, key: string): Vnd => vnd(num(row, key));
const oneOf = <T extends string>(row: Row, key: string, allowed: readonly string[]): T => {
  const value = str(row, key);
  if (!allowed.includes(value)) throw new TypeError(`${key} is ${value}`);
  return value as T;
};
const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);

function lineOf(row: Row): { line: OrderLine; sent: SentLineState | null } {
  const line: OrderLine = {
    id: str(row, "id"),
    parentLineId: strOrNull(row, "parentLineId"),
    lineType: oneOf(row, "lineType", LINE_TYPES),
    productId: strOrNull(row, "productId"),
    variantId: strOrNull(row, "variantId"),
    modifierOptionId: strOrNull(row, "modifierOptionId"),
    nameSnapshot: str(row, "nameSnapshot"),
    unitPrice: money(row, "unitPrice"),
    quantity: quantity(str(row, "quantity")),
    taxRate: basisPoints(num(row, "taxRate")),
    note: strOrNull(row, "note"),
    priceSource: oneOf(row, "priceSource", SOURCES),
    reversesLineId: strOrNull(row, "reversesLineId"),
    ...(row.wholeParentLine === true ? { wholeParentLine: true } : {}),
  };
  const sentText = strOrNull(row, "sentQuantity");
  const sentQuantity = sentText === null ? null : quantity(sentText);
  const isRoot = line.parentLineId === null && line.lineType === "item";
  return {
    line,
    sent:
      isRoot && sentQuantity !== null && sentQuantity > 0n
        ? { lineId: line.id, sentQuantity, sentNote: strOrNull(row, "sentNote") }
        : null,
  };
}

function refundAmountsOf(value: unknown): RefundAmounts | null {
  if (value === null || value === undefined) return null;
  const amounts = value as Row;
  if (typeof amounts.pricesIncludeTax !== "boolean") throw new TypeError("pricesIncludeTax");
  return {
    pricesIncludeTax: amounts.pricesIncludeTax,
    serviceChargeTaxRate: basisPoints(num(amounts, "serviceChargeTaxRate")),
    lines: rows(amounts.lines).map((line) => ({
      lineId: str(line, "lineId"),
      soldLineId: str(line, "soldLineId"),
      gross: money(line, "gross"),
      discountAllocated: money(line, "discountAllocated"),
      tax: money(line, "tax"),
      serviceCharge: money(line, "serviceCharge"),
      serviceChargeTax: money(line, "serviceChargeTax"),
    })),
  };
}

/**
 * The order as the till's screens need it, or null when the row is not a readable order
 * (an old or a foreign shape): a screen then says it cannot open it rather than guess.
 */
export function readStoredOrder(snapshot: EntitySnapshot): StoredOrder | null {
  try {
    const profile = posChargeProfileSchema.safeParse(snapshot.chargeProfile);
    if (!profile.success || !Array.isArray(snapshot.lines)) return null;
    const lines = rows(snapshot.lines).map(lineOf);
    const printed = snapshot.preBillPrintedVersion;
    return {
      orderId: str(snapshot, "id"),
      deviceId: str(snapshot, "deviceId"),
      deviceOrderNo: num(snapshot, "deviceOrderNo"),
      status: oneOf(snapshot, "status", STATUSES),
      serviceType: oneOf(snapshot, "serviceType", SERVICE_TYPES),
      tableTag: strOrNull(snapshot, "tableTag"),
      businessDate: str(snapshot, "businessDate"),
      version: num(snapshot, "version"),
      tableId: strOrNull(snapshot, "tableId"),
      tableName: strOrNull(snapshot, "tableName"),
      preBillPrinted: snapshot.preBillPrinted === true,
      preBillPrintedVersion: Number.isSafeInteger(printed) ? (printed as number) : null,
      openedAt: typeof snapshot.openedAt === "string" ? snapshot.openedAt : null,
      reasonCode: strOrNull(snapshot, "reasonCode"),
      chargeProfile: profile.data,
      lines: lines.map((entry) => entry.line),
      sent: lines.flatMap((entry) => (entry.sent === null ? [] : [entry.sent])),
      refundOfOrderId: strOrNull(snapshot, "refundOfOrderId"),
      refundAmounts: refundAmountsOf(snapshot.refundAmounts),
      payments: rows(snapshot.payments).map((row) => ({
        method: str(row, "method"),
        amount: money(row, "amount"),
      })),
    };
  } catch {
    return null;
  }
}

/** The stored order as the domain's order, for its builders and totals. */
export function domainOrderOf(stored: StoredOrder): Order {
  return {
    id: stored.orderId,
    status: stored.status,
    serviceType: stored.serviceType,
    channelKey: null,
    businessDate: stored.businessDate,
    lines: stored.lines,
    refundOfOrderId: stored.refundOfOrderId,
    refundAmounts: stored.refundAmounts,
    version: stored.version,
  };
}
