import {
  type OrderLine,
  type OrderLineType,
  type PriceSource,
  type Quantity,
  basisPoints,
  quantity,
  vnd,
} from "@fnb/domain";
import type pg from "pg";

/** A draft's lines as the domain reads them, and what only the stored rows carry. */
export interface StoredOrderLines {
  readonly lines: OrderLine[];
  /** Units of each line the kitchen has had, cancelled ones included; 0 when none. */
  readonly sentQuantityByLineId: ReadonlyMap<string, Quantity>;
  /** The note each line had when the stations last saw it printed; null when never sent. */
  readonly sentNoteByLineId: ReadonlyMap<string, string | null>;
  /** On a refund's negative items: whether the goods go back into stock. */
  readonly restockByLineId: ReadonlyMap<string, boolean>;
}

interface LineRow {
  id: string;
  parent_line_id: string | null;
  line_type: string;
  product_id: string | null;
  variant_id: string | null;
  modifier_option_id: string | null;
  name_snapshot: string;
  unit_price: string;
  quantity: string;
  tax_rate_bp: number;
  note: string | null;
  price_source: string;
  reverses_line_id: string | null;
  whole_parent_line: boolean;
  sent_quantity: string;
  sent_note: string | null;
  restock: boolean | null;
}

/** The order's lines in the order they were rung up, parents always before their children. */
export async function readStoredOrderLines(
  client: pg.ClientBase,
  orderId: string,
): Promise<StoredOrderLines> {
  const { rows } = await client.query<LineRow>(
    "SELECT * FROM sales_order_line WHERE order_id = $1 ORDER BY position, id",
    [orderId],
  );
  const restock = new Map<string, boolean>();
  for (const row of rows) if (row.restock !== null) restock.set(row.id, row.restock);
  return {
    lines: rows.map(lineOf),
    sentQuantityByLineId: new Map(rows.map((row) => [row.id, quantity(row.sent_quantity)])),
    sentNoteByLineId: new Map(rows.map((row) => [row.id, row.sent_note])),
    restockByLineId: restock,
  };
}

// The text columns hold only the values their CHECK constraints allow.
function lineOf(row: LineRow): OrderLine {
  return {
    id: row.id,
    parentLineId: row.parent_line_id,
    lineType: row.line_type as OrderLineType,
    productId: row.product_id,
    variantId: row.variant_id,
    modifierOptionId: row.modifier_option_id,
    nameSnapshot: row.name_snapshot,
    unitPrice: vnd(BigInt(row.unit_price)),
    quantity: quantity(row.quantity),
    taxRate: basisPoints(row.tax_rate_bp),
    note: row.note,
    priceSource: row.price_source as PriceSource,
    reversesLineId: row.reverses_line_id,
    // Only a line discount carries the flag, so other lines read exactly as the domain built them.
    ...(row.whole_parent_line ? { wholeParentLine: true } : {}),
  };
}
