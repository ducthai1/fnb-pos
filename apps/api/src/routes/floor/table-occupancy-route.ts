import { tableStatusOf } from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { deviceAuth } from "../../devices/device-auth-hook";
import {
  AREA_COLUMNS,
  type AreaRow,
  DINING_TABLE_COLUMNS,
  type DiningTableRow,
  areaView,
  diningTableView,
} from "./floor-row-views";

type OccupiedRow = DiningTableRow & {
  order_id: string | null;
  opened_at: Date | null;
  pre_bill_current: boolean | null;
};

/**
 * The till's floor screen: its branch's plan (archived areas and tables left out) and each
 * table's status, read from the draft order seated at it, which the database keeps to one.
 * openedAt is when that order was opened, so the time guests have sat survives a move to
 * another table. Only the till's own branch is ever shown.
 */
export function registerTableOccupancyRoute(app: FastifyInstance, context: ApiContext): void {
  app.get("/floor/occupancy", { onRequest: context.requireDevice }, async (request, reply) => {
    const device = deviceAuth(request);
    const { areas, tables } = await withTenant(context.pool, device.tenantId, async (client) => ({
      areas: await client.query<AreaRow>(
        `SELECT ${AREA_COLUMNS} FROM area WHERE branch_id = $1 AND archived_at IS NULL ` +
          "ORDER BY sort_order, name, id",
        [device.branchId],
      ),
      tables: await client.query<OccupiedRow>(
        `SELECT ${DINING_TABLE_COLUMNS}, o.id AS order_id, o.created_at AS opened_at, ` +
          "o.pre_bill_printed_version = o.version AS pre_bill_current " +
          "FROM dining_table t JOIN area a ON a.id = t.area_id " +
          "LEFT JOIN sales_order o ON o.table_id = t.id AND o.status = 'draft' " +
          "WHERE a.branch_id = $1 AND a.archived_at IS NULL AND t.archived_at IS NULL " +
          "ORDER BY a.sort_order, a.name, a.id, t.sort_order, t.name, t.id",
        [device.branchId],
      ),
    }));
    return reply.send({
      areas: areas.rows.map(areaView),
      tables: tables.rows.map((row) => ({
        ...diningTableView(row),
        status: tableStatusOf(
          row.order_id === null ? null : { preBillPrinted: row.pre_bill_current === true },
        ),
        orderId: row.order_id,
        openedAt: row.opened_at === null ? null : row.opened_at.toISOString(),
      })),
    });
  });
}
