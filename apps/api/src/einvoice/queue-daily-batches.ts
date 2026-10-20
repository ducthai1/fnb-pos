import { einvoiceRegimeRules } from "@fnb/contracts";
import { newId } from "@fnb/db";
import type pg from "pg";

export interface DayToBatch {
  readonly tenantId: string;
  readonly branchId: string;
  readonly businessDate: string;
  readonly now: Date;
  readonly createdBy: string;
}

interface BatchGroup {
  provider: string;
  regime_version: string;
  seller: unknown;
  ids: string[];
}

/**
 * Queues the batches that send the day's issued invoices on, one per provider, regime and
 * seller (a profile changed during the day sends each part as what it was issued under),
 * for regimes that ask for daily submission. Only invoices in no batch yet are taken, so a
 * day's invoices are each sent once. Answers the new batches' ids.
 */
export async function queueDailyBatches(client: pg.ClientBase, day: DayToBatch): Promise<string[]> {
  const { rows } = await client.query<BatchGroup>(
    "SELECT provider, regime_version, seller, array_agg(id ORDER BY sold_at, id) AS ids " +
      "FROM einvoice WHERE branch_id = $1 AND business_date = $2 AND status = 'issued' " +
      "AND batch_id IS NULL GROUP BY provider, regime_version, seller " +
      "ORDER BY provider, regime_version",
    [day.branchId, day.businessDate],
  );
  const batchIds: string[] = [];
  for (const group of rows) {
    if (einvoiceRegimeRules(group.regime_version)?.dailySubmission !== true) continue;
    const id = newId();
    await client.query(
      "INSERT INTO einvoice_daily_batch (id, tenant_id, branch_id, business_date, provider, " +
        "regime_version, seller, invoice_count, next_attempt_at, created_at, updated_at, created_by) " +
        "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $9, $10)",
      [
        id,
        day.tenantId,
        day.branchId,
        day.businessDate,
        group.provider,
        group.regime_version,
        JSON.stringify(group.seller),
        group.ids.length,
        day.now,
        day.createdBy,
      ],
    );
    await client.query("UPDATE einvoice SET batch_id = $1 WHERE id = ANY ($2::uuid[])", [
      id,
      group.ids,
    ]);
    batchIds.push(id);
  }
  return batchIds;
}
