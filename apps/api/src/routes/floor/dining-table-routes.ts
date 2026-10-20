import { diningTableBodySchema, floorBranchQuerySchema, floorIdParamsSchema } from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import type { ApiContext } from "../../api-context";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { insertCatalogRow, updateCatalogRow } from "../../catalog/catalog-row-writes";
import { announceFloorRow } from "../../floor/announce-floor-to-tills";
import { requireBranch } from "./area-routes";
import { FLOOR_API_ERROR_CODES } from "./floor-api-error-codes";
import {
  FloorRequestError,
  floorGates,
  floorHandler,
  floorWriterOf,
  parseOrReject,
  refuseStaleOrArchived,
} from "./floor-route-support";
import { DINING_TABLE_COLUMNS, type DiningTableRow, diningTableView } from "./floor-row-views";
import { removeOrArchiveTable } from "./remove-or-archive-table";

type StoredTable = DiningTableRow & { branch_id: string };

const readTable = async (client: pg.PoolClient, id: string, lock = "") =>
  (
    await client.query<StoredTable>(
      `SELECT ${DINING_TABLE_COLUMNS}, a.branch_id FROM dining_table t ` +
        `JOIN area a ON a.id = t.area_id WHERE t.id = $1 ${lock}`,
      [id],
    )
  ).rows[0];

/**
 * The area a table is put in. Shared-locked, so an area being archived at this moment
 * either sees this table or is seen archived here, never neither.
 */
async function targetArea(client: pg.PoolClient, areaId: string) {
  const found = await client.query<{ branch_id: string; archived_at: Date | null }>(
    "SELECT branch_id, archived_at FROM area WHERE id = $1 FOR SHARE",
    [areaId],
  );
  const area = found.rows[0];
  if (area === undefined) throw new FloorRequestError(404, FLOOR_API_ERROR_CODES.areaNotFound);
  if (area.archived_at !== null) {
    throw new FloorRequestError(409, FLOOR_API_ERROR_CODES.areaArchived);
  }
  return area;
}

/** GET tables of a branch, PUT create-or-replace under a version, DELETE or archive. */
export function registerDiningTableRoutes(app: FastifyInstance, context: ApiContext): void {
  const { read, write } = floorGates(context);

  app.get(
    "/floor/tables",
    read,
    floorHandler(async (request, reply) => {
      const { branchId } = parseOrReject(floorBranchQuerySchema, request.query);
      const rows = await withTenant(context.pool, backofficeAuth(request).tenantId, async (c) => {
        await requireBranch(c, branchId);
        const listed = await c.query<DiningTableRow>(
          `SELECT ${DINING_TABLE_COLUMNS} FROM dining_table t JOIN area a ON a.id = t.area_id ` +
            "WHERE a.branch_id = $1 " +
            "ORDER BY a.sort_order, a.name, a.id, t.sort_order, t.name, t.id",
          [branchId],
        );
        return listed.rows;
      });
      return reply.send(rows.map(diningTableView));
    }),
  );

  app.put(
    "/floor/tables/:id",
    write,
    floorHandler(async (request, reply) => {
      const { id } = parseOrReject(floorIdParamsSchema, request.params);
      const input = parseOrReject(diningTableBodySchema, request.body);
      const writer = floorWriterOf(request, context);
      const { version, areaId, sortOrder, ...placed } = input;
      const cells = { area_id: areaId, sort_order: sortOrder, ...placed };
      const saved = await withTenant(context.pool, writer.tenantId, async (client) => {
        const stored = await readTable(client, id, "FOR UPDATE OF t");
        if (stored === undefined && version !== null) {
          throw new FloorRequestError(404, FLOOR_API_ERROR_CODES.tableNotFound);
        }
        if (stored !== undefined) refuseStaleOrArchived(stored, version);
        const area = await targetArea(client, areaId);
        if (stored === undefined) {
          await insertCatalogRow(client, "dining_table", writer, { id, ...cells });
        } else {
          // Orders seated at it belong to its branch; it may only move between its areas.
          if (stored.branch_id !== area.branch_id) {
            throw new FloorRequestError(400, FLOOR_API_ERROR_CODES.branchChangeNotAllowed);
          }
          await updateCatalogRow(client, "dining_table", writer, id, cells);
        }
        await announceFloorRow(client, writer.tenantId, area.branch_id, { kind: "table", id });
        return { created: stored === undefined, row: await readTable(client, id) };
      });
      return reply.code(saved.created ? 201 : 200).send(diningTableView(saved.row!));
    }),
  );

  app.delete(
    "/floor/tables/:id",
    write,
    floorHandler(async (request, reply) => {
      const { id } = parseOrReject(floorIdParamsSchema, request.params);
      const writer = floorWriterOf(request, context);
      const outcome = await withTenant(context.pool, writer.tenantId, async (client) => {
        const stored = await readTable(client, id, "FOR UPDATE OF t");
        if (stored === undefined) {
          throw new FloorRequestError(404, FLOOR_API_ERROR_CODES.tableNotFound);
        }
        const outcome = await removeOrArchiveTable(client, writer, id);
        await announceFloorRow(client, writer.tenantId, stored.branch_id, { kind: "table", id });
        return outcome;
      });
      return reply.send({ id, outcome });
    }),
  );
}
