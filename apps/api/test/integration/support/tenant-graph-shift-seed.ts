import { cashMove, drizzleFor, shiftCount } from "@fnb/db";
import type pg from "pg";

export interface ShiftSeedIds {
  staff: string;
  shift: string;
  cash_move: string;
  shift_count: string;
}

/** One row in every shift table, under the graph's shift, which stays open. */
export async function seedShiftRows(
  client: pg.PoolClient,
  tenantId: string,
  ids: ShiftSeedIds,
): Promise<void> {
  const db = drizzleFor(client);
  await db.insert(cashMove).values({
    id: ids.cash_move,
    tenantId,
    shiftId: ids.shift,
    kind: "out",
    amount: 120_000n,
    reason: "Trả tiền đá",
    staffId: ids.staff,
  });
  await db.insert(shiftCount).values({
    id: ids.shift_count,
    tenantId,
    shiftId: ids.shift,
    stage: "opening",
    denomination: 500_000n,
    pieces: 1,
  });
}
