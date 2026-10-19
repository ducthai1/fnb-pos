import { type OrderLine, quantityToDecimalString } from "@fnb/domain";
import type pg from "pg";

/** Whom the rows are written for, and the refund's restock choices for its new lines. */
export interface OrderLineWrite {
  readonly tenantId: string;
  readonly orderId: string;
  readonly staffId: string;
  readonly restockByLineId?: Readonly<Record<string, boolean>>;
}

/**
 * Brings a draft's stored lines from `before` to `after` by line id: lines gone are
 * deleted, new ones inserted, changed ones updated in place, and untouched ones left as
 * they are. A line keeps its row and id for as long as it is on the order, because cancel
 * lines, void records and kitchen tickets point at it. `after` lists parents before their
 * children, and positions follow its order.
 */
export async function writeOrderLines(
  client: pg.ClientBase,
  write: OrderLineWrite,
  before: readonly OrderLine[],
  after: readonly OrderLine[],
) {
  const kept = new Set(after.map((line) => line.id));
  const gone = before.filter((line) => !kept.has(line.id)).map((line) => line.id);
  // One statement, so a line and its toppings go together under the parent key.
  if (gone.length > 0) {
    await client.query(
      "DELETE FROM sales_order_line WHERE order_id = $1 AND id = ANY($2::uuid[])",
      [write.orderId, gone],
    );
  }
  const earlier = new Map(before.map((line, position) => [line.id, { line, position }]));
  for (const [position, line] of after.entries()) {
    const was = earlier.get(line.id);
    if (was === undefined) await insertLine(client, write, line, position);
    else if (was.position !== position || !sameLine(was.line, line)) {
      await updateLine(client, line, position);
    }
  }
}

const CONTENT = [
  "parent_line_id",
  "line_type",
  "product_id",
  "variant_id",
  "modifier_option_id",
  "name_snapshot",
  "unit_price",
  "quantity",
  "tax_rate_bp",
  "note",
  "price_source",
  "reverses_line_id",
  "whole_parent_line",
] as const;

function contentOf(line: OrderLine): unknown[] {
  return [
    line.parentLineId,
    line.lineType,
    line.productId,
    line.variantId,
    line.modifierOptionId,
    line.nameSnapshot,
    line.unitPrice.toString(),
    quantityToDecimalString(line.quantity),
    line.taxRate,
    line.note,
    line.priceSource,
    line.reversesLineId,
    line.wholeParentLine === true,
  ];
}

function sameLine(a: OrderLine, b: OrderLine): boolean {
  const left = contentOf(a);
  const right = contentOf(b);
  return left.every((value, index) => value === right[index]);
}

async function insertLine(
  client: pg.ClientBase,
  write: OrderLineWrite,
  line: OrderLine,
  position: number,
) {
  const columns = ["id", "tenant_id", "order_id", "position", ...CONTENT, "restock", "created_by"];
  const values = [
    line.id,
    write.tenantId,
    write.orderId,
    position,
    ...contentOf(line),
    write.restockByLineId?.[line.id] ?? null,
    write.staffId,
  ];
  const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
  await client.query(
    `INSERT INTO sales_order_line (${columns.join(", ")}) VALUES (${placeholders})`,
    values,
  );
}

async function updateLine(client: pg.ClientBase, line: OrderLine, position: number) {
  const assignments = ["position", ...CONTENT].map((column, index) => `${column} = $${index + 2}`);
  await client.query(
    `UPDATE sales_order_line SET ${assignments.join(", ")}, version = version + 1, ` +
      "updated_at = now() WHERE id = $1",
    [line.id, position, ...contentOf(line)],
  );
}
