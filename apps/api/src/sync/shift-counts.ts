import { newId } from "@fnb/db";
import { vnd } from "@fnb/domain";
import { type DenominationCount, confirmCount } from "@fnb/domain/shift";
import type pg from "pg";

export interface SentCount {
  readonly denomination: number;
  readonly pieces: number;
}

/** The notes a till sent, checked by the domain against the amount it stated. */
export function confirmedCount(stated: number, sent: readonly SentCount[]) {
  const counts: DenominationCount[] = sent.map((row) => ({
    denomination: vnd(row.denomination),
    pieces: row.pieces,
  }));
  return { total: confirmCount(vnd(stated), counts), counts };
}

/** Stores one stage's count; called before a close, which freezes everything under it. */
export async function insertShiftCount(
  client: pg.ClientBase,
  tenantId: string,
  shiftId: string,
  stage: "opening" | "closing",
  counts: readonly DenominationCount[],
  staffId: string,
): Promise<void> {
  for (const { denomination, pieces } of counts) {
    await client.query(
      "INSERT INTO shift_count (id, tenant_id, shift_id, stage, denomination, pieces, created_by) " +
        "VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [newId(), tenantId, shiftId, stage, denomination, pieces, staffId],
    );
  }
}
