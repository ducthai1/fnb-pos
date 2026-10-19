import type { SyncShop, Till } from "@fnb/api/test-support/sync-shop";
import { withTenant } from "@fnb/db";
import { createHttpSyncTransport } from "../../src";
import type { ScenarioServer } from "./scenario-server";

export interface StoredOrderSummary {
  status: string;
  version: number;
  lines: number;
  payments: number;
  paid: number;
}

/** Every order of the shop's branch as the database holds it, read as the app role. */
export async function storedOrders(server: ScenarioServer, shop: SyncShop) {
  const { rows } = await withTenant(server.pool, shop.shop.tenantId, (client) =>
    client.query<{
      id: string;
      status: string;
      version: number;
      lines: string;
      payments: string;
      paid: string;
    }>(
      "SELECT o.id, o.status, o.version, " +
        "(SELECT count(*) FROM sales_order_line l WHERE l.order_id = o.id) AS lines, " +
        "(SELECT count(*) FROM payment p WHERE p.order_id = o.id) AS payments, " +
        "(SELECT coalesce(sum(p.amount), 0) FROM payment p WHERE p.order_id = o.id) AS paid " +
        "FROM sales_order o WHERE o.branch_id = $1",
      [shop.shop.branchId],
    ),
  );
  return new Map(
    rows.map((row): [string, StoredOrderSummary] => [
      row.id,
      {
        status: row.status,
        version: row.version,
        lines: Number(row.lines),
        payments: Number(row.payments),
        paid: Number(row.paid),
      },
    ]),
  );
}

/** What the server took from one till: commands by outcome, and change rows per command. */
export async function serverLedger(server: ScenarioServer, shop: SyncShop, till: Till) {
  return withTenant(server.pool, shop.shop.tenantId, async (client) => {
    const outcomes = await client.query<{ status: string; n: string }>(
      "SELECT status, count(*) AS n FROM applied_command WHERE device_id = $1 GROUP BY status",
      [till.deviceId],
    );
    const repeated = await client.query<{ n: string }>(
      "SELECT count(*) AS n FROM (SELECT command_id FROM change_log GROUP BY command_id, entity_id " +
        "HAVING count(*) > 1) AS twice",
    );
    const byStatus = Object.fromEntries(outcomes.rows.map((row) => [row.status, Number(row.n)]));
    return {
      accepted: byStatus.accepted ?? 0,
      rejected: byStatus.rejected ?? 0,
      changeRowsWrittenTwice: Number(repeated.rows[0]?.n ?? 0),
    };
  });
}

/** The newest row of every order in the change feed, pulled from the start by a fresh reader. */
export async function feedOrders(server: ScenarioServer, till: Till) {
  const transport = createHttpSyncTransport({
    send: server.send,
    deviceToken: till.deviceToken,
    staffSessionToken: () => null,
  });
  const orders = new Map<string, unknown>();
  for (let cursor = "0"; ;) {
    const page = await transport.pullChanges(cursor, 1_000);
    if (page.changes.length === 0) return orders;
    for (const change of page.changes) orders.set(change.entityId, change.snapshot);
    cursor = page.nextCursor;
  }
}
