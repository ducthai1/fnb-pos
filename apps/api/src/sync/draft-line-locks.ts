import { type OrderLine, type Quantity, subtreeOf } from "@fnb/domain";
import type pg from "pg";
import { CommandRejection, SYNC_ERROR_CODES } from "./sync-error-codes";

/** What, beyond its lines, decides which lines of a stored draft a save may not touch. */
export interface DraftLineLocks {
  readonly sentQuantityByLineId: ReadonlyMap<string, Quantity>;
  /** Items a void record names, including ones a void took off the order entirely. */
  readonly voidedLineIds: ReadonlySet<string>;
}

export async function readVoidedLineIds(
  client: pg.ClientBase,
  orderId: string,
): Promise<Set<string>> {
  const { rows } = await client.query<{ line_id: string }>(
    "SELECT DISTINCT line_id FROM line_void_record WHERE order_id = $1",
    [orderId],
  );
  return new Set(rows.map((row) => row.line_id));
}

/**
 * The draft as saved: the till's items in its order, then the lines only commands make
 * (discounts, cancel lines and their copies), which a till's draft never carries and a
 * save keeps as they are. An item something points at (a void record, a cancel line, a
 * discount) is kept exactly as stored; one the kitchen has may only grow. Either must
 * come back in the save, with the same choices, or the save is refused: dropping or
 * changing it would rewrite what a ticket or a void already showed.
 */
export function mergeDraftLines(
  stored: readonly OrderLine[],
  fresh: readonly OrderLine[],
  locks: DraftLineLocks,
): OrderLine[] {
  const commandMade = commandMadeLines(stored);
  const commandMadeIds = new Set(commandMade.map((line) => line.id));
  const storedItems = new Map(
    stored
      .filter((line) => line.parentLineId === null && !commandMadeIds.has(line.id))
      .map((line) => [line.id, line]),
  );
  const freshItems = fresh.filter((line) => line.parentLineId === null);
  const merged: OrderLine[] = [];
  for (const item of freshItems) {
    const was = storedItems.get(item.id);
    if (was === undefined && locks.voidedLineIds.has(item.id)) refuse();
    const lock = was === undefined ? "none" : lockOf(was, stored, locks);
    const tree = subtreeOf(fresh, item.id);
    if (was === undefined || lock === "none") merged.push(...tree);
    else merged.push(...keptTree(was, stored, item, tree, lock === "referenced"));
  }
  const saved = new Set(freshItems.map((item) => item.id));
  for (const was of storedItems.values()) {
    if (!saved.has(was.id) && lockOf(was, stored, locks) !== "none") refuse();
  }
  return [...merged, ...commandMade];
}

function commandMadeLines(stored: readonly OrderLine[]): OrderLine[] {
  const ids = new Set<string>();
  for (const line of stored) {
    if (line.lineType === "discount") ids.add(line.id);
    if (line.reversesLineId !== null)
      for (const part of subtreeOf(stored, line.id)) ids.add(part.id);
  }
  return stored.filter((line) => ids.has(line.id));
}

function lockOf(
  item: OrderLine,
  stored: readonly OrderLine[],
  locks: DraftLineLocks,
): "none" | "sent" | "referenced" {
  const pointedAt =
    locks.voidedLineIds.has(item.id) ||
    stored.some(
      (line) =>
        line.reversesLineId === item.id ||
        (line.parentLineId === item.id && line.lineType === "discount"),
    );
  if (pointedAt) return "referenced";
  return (locks.sentQuantityByLineId.get(item.id) ?? 0n) > 0n ? "sent" : "none";
}

/**
 * The stored item with its options (and a combo's picks with theirs), the quantity raised
 * when the lock allows it.
 */
function keptTree(
  was: OrderLine,
  stored: readonly OrderLine[],
  item: OrderLine,
  freshTree: readonly OrderLine[],
  exact: boolean,
): OrderLine[] {
  const storedChildren = subtreeOf(stored, was.id).filter(
    (line) => line.id !== was.id && line.lineType !== "discount",
  );
  const same =
    item.productId === was.productId &&
    item.variantId === was.variantId &&
    item.note === was.note &&
    (was.priceSource !== "manual" || item.unitPrice === was.unitPrice) &&
    (exact ? item.quantity === was.quantity : item.quantity >= was.quantity) &&
    choicesOf(freshTree, item.id) === choicesOf(storedChildren, was.id);
  if (!same) refuse();
  return [{ ...was, quantity: item.quantity }, ...storedChildren];
}

/** What hangs under a line, whatever the ids: a pick with the options under it, an option. */
function choicesOf(lines: readonly OrderLine[], parentLineId: string): string {
  return lines
    .filter((line) => line.parentLineId === parentLineId && line.lineType !== "discount")
    .map(
      (line) =>
        `${line.lineType}:${line.productId}:${line.variantId}:${line.modifierOptionId}:` +
        `${line.quantity}(${choicesOf(lines, line.id)})`,
    )
    .sort()
    .join(",");
}

function refuse(): never {
  throw new CommandRejection(SYNC_ERROR_CODES.lineLocked);
}
