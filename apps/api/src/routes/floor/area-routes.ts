import { areaBodySchema, floorBranchQuerySchema, floorIdParamsSchema } from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import type { ApiContext } from "../../api-context";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { insertCatalogRow, updateCatalogRow } from "../../catalog/catalog-row-writes";
import { announceFloorRow } from "../../floor/announce-floor-to-tills";
import { FLOOR_API_ERROR_CODES } from "./floor-api-error-codes";
import {
  FloorRequestError,
  floorGates,
  floorHandler,
  floorWriterOf,
  parseOrReject,
  refuseStaleOrArchived,
} from "./floor-route-support";
import { AREA_COLUMNS, type AreaRow, areaView } from "./floor-row-views";

/** The branch, or 404: another tenant's branches are invisible, so they read as missing. */
export async function requireBranch(client: pg.PoolClient, branchId: string): Promise<void> {
  const found = await client.query("SELECT 1 FROM branch WHERE id = $1", [branchId]);
  if (found.rowCount === 0) throw new FloorRequestError(404, FLOOR_API_ERROR_CODES.branchNotFound);
}

const readArea = async (client: pg.PoolClient, id: string, lock = "") =>
  (await client.query<AreaRow>(`SELECT ${AREA_COLUMNS} FROM area WHERE id = $1 ${lock}`, [id]))
    .rows[0];

/** GET areas of a branch, PUT create-or-replace under a version, DELETE or archive. */
export function registerAreaRoutes(app: FastifyInstance, context: ApiContext): void {
  const { read, write } = floorGates(context);

  app.get(
    "/floor/areas",
    read,
    floorHandler(async (request, reply) => {
      const { branchId } = parseOrReject(floorBranchQuerySchema, request.query);
      const rows = await withTenant(context.pool, backofficeAuth(request).tenantId, async (c) => {
        await requireBranch(c, branchId);
        const listed = await c.query<AreaRow>(
          `SELECT ${AREA_COLUMNS} FROM area WHERE branch_id = $1 ORDER BY sort_order, name, id`,
          [branchId],
        );
        return listed.rows;
      });
      return reply.send(rows.map(areaView));
    }),
  );

  app.put(
    "/floor/areas/:id",
    write,
    floorHandler(async (request, reply) => {
      const { id } = parseOrReject(floorIdParamsSchema, request.params);
      const input = parseOrReject(areaBodySchema, request.body);
      const writer = floorWriterOf(request, context);
      const cells = { name: input.name, sort_order: input.sortOrder };
      const saved = await withTenant(context.pool, writer.tenantId, async (client) => {
        const stored = await readArea(client, id, "FOR UPDATE");
        if (stored === undefined) {
          if (input.version !== null) {
            throw new FloorRequestError(404, FLOOR_API_ERROR_CODES.areaNotFound);
          }
          await requireBranch(client, input.branchId);
          await insertCatalogRow(client, "area", writer, {
            id,
            branch_id: input.branchId,
            ...cells,
          });
        } else {
          refuseStaleOrArchived(stored, input.version);
          // Its tables, and the orders seated at them, belong to the branch it is in.
          if (stored.branch_id !== input.branchId) {
            throw new FloorRequestError(400, FLOOR_API_ERROR_CODES.branchChangeNotAllowed);
          }
          await updateCatalogRow(client, "area", writer, id, cells);
        }
        await announceFloorRow(client, writer.tenantId, input.branchId, { kind: "area", id });
        return { created: stored === undefined, row: await readArea(client, id) };
      });
      return reply.code(saved.created ? 201 : 200).send(areaView(saved.row!));
    }),
  );

  // Deleted when no table ever stood in it; archived when only archived tables did, as
  // they keep pointing at it; refused while a table of it is still on the floor.
  app.delete(
    "/floor/areas/:id",
    write,
    floorHandler(async (request, reply) => {
      const { id } = parseOrReject(floorIdParamsSchema, request.params);
      const writer = floorWriterOf(request, context);
      const outcome = await withTenant(context.pool, writer.tenantId, async (client) => {
        const stored = await readArea(client, id, "FOR UPDATE");
        if (stored === undefined) {
          throw new FloorRequestError(404, FLOOR_API_ERROR_CODES.areaNotFound);
        }
        const tables = await client.query<{ active: boolean }>(
          "SELECT bool_or(archived_at IS NULL) AS active FROM dining_table WHERE area_id = $1",
          [id],
        );
        const active = tables.rows[0]?.active ?? null;
        if (active === true) throw new FloorRequestError(409, FLOOR_API_ERROR_CODES.areaHasTables);
        const off = { kind: "area" as const, id };
        if (active === null) {
          await client.query("DELETE FROM area WHERE id = $1", [id]);
          await announceFloorRow(client, writer.tenantId, stored.branch_id, off);
          return { id, outcome: "deleted" as const };
        }
        if (stored.archived_at === null) {
          await updateCatalogRow(client, "area", writer, id, { archived_at: writer.now });
          await announceFloorRow(client, writer.tenantId, stored.branch_id, off);
        }
        return { id, outcome: "archived" as const };
      });
      return reply.send(outcome);
    }),
  );
}
