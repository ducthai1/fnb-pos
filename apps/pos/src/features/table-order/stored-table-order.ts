import { type EntitySnapshot, posChargeProfileSchema } from "@fnb/contracts";
import {
  type OrderChargeProfile,
  type OrderLine,
  type OrderStatus,
  type SentLineState,
  basisPoints,
  quantity,
  vnd,
} from "@fnb/domain";

/** An order row the till holds (its own expectation or the server's), as tables read it. */
export interface StoredTableOrder {
  readonly orderId: string;
  /** The till that opened the order, whose number it carries. */
  readonly deviceId: string;
  readonly deviceOrderNo: number;
  readonly status: OrderStatus;
  readonly businessDate: string;
  readonly version: number;
  readonly tableId: string | null;
  readonly tableName: string | null;
  readonly preBillPrinted: boolean;
  readonly chargeProfile: OrderChargeProfile;
  /** Every line as stored, prices included: what the server keeps for lines it locked. */
  readonly lines: readonly OrderLine[];
  /** What the stations were shown of each root item. */
  readonly sent: readonly SentLineState[];
}

type Row = Record<string, unknown>;
const STATUSES: readonly string[] = ["draft", "paid", "posted", "cancelled"];
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
const oneOf = <T extends string>(row: Row, key: string, allowed: readonly string[]): T => {
  const value = str(row, key);
  if (!allowed.includes(value)) throw new TypeError(`${key} is ${value}`);
  return value as T;
};

function lineOf(row: Row): { line: OrderLine; sent: SentLineState | null } {
  const line: OrderLine = {
    id: str(row, "id"),
    parentLineId: strOrNull(row, "parentLineId"),
    lineType: oneOf(row, "lineType", LINE_TYPES),
    productId: strOrNull(row, "productId"),
    variantId: strOrNull(row, "variantId"),
    modifierOptionId: strOrNull(row, "modifierOptionId"),
    nameSnapshot: str(row, "nameSnapshot"),
    unitPrice: vnd(num(row, "unitPrice")),
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

/**
 * The order as tables need it, or null when the row is not a readable order (an old or a
 * foreign shape): the screen then says it cannot open it rather than guess.
 */
export function readStoredTableOrder(snapshot: EntitySnapshot): StoredTableOrder | null {
  try {
    const profile = posChargeProfileSchema.safeParse(snapshot.chargeProfile);
    if (!profile.success || !Array.isArray(snapshot.lines)) return null;
    const lines = snapshot.lines.map((row) => lineOf(row as Row));
    return {
      orderId: str(snapshot, "id"),
      deviceId: str(snapshot, "deviceId"),
      deviceOrderNo: num(snapshot, "deviceOrderNo"),
      status: oneOf(snapshot, "status", STATUSES),
      businessDate: str(snapshot, "businessDate"),
      version: num(snapshot, "version"),
      tableId: strOrNull(snapshot, "tableId"),
      tableName: strOrNull(snapshot, "tableName"),
      preBillPrinted: snapshot.preBillPrinted === true,
      chargeProfile: profile.data,
      lines: lines.map((entry) => entry.line),
      sent: lines.flatMap((entry) => (entry.sent === null ? [] : [entry.sent])),
    };
  } catch {
    return null;
  }
}
