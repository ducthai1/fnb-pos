import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { postgresErrorCode } from "../support/postgres-error-code";
import { CHECK_VIOLATION, UNIQUE_VIOLATION } from "../support/insert-attempt";
import { type TenantGraph, seedTenantGraph } from "../support/tenant-graph";

const info = inject("testPostgres");

let pool: pg.Pool;
let a: TenantGraph;
// Past the order numbers the tenant graph seeds for the same till.
let orderNo = 1_000;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  a = await seedTenantGraph(pool);
});

afterAll(async () => {
  await pool.end();
});

interface Seating {
  status?: "draft" | "cancelled";
  serviceType?: string;
  tableId?: string | null;
  tableName?: string | null;
  tableTag?: string | null;
}

/** Writes one order in its own transaction and answers the SQLSTATE, or "no-error". */
function seat(seating: Seating): Promise<string> {
  const tableId = seating.tableId === undefined ? a.ids.dining_table : seating.tableId;
  const tableName = seating.tableName === undefined ? (tableId && "B01") : seating.tableName;
  return postgresErrorCode(() =>
    withTenant(pool, a.tenantId, (client) =>
      client.query(
        "INSERT INTO sales_order (id, tenant_id, branch_id, device_id, status, service_type, " +
          "business_date, device_order_no, charge_profile, table_id, table_name_snapshot, " +
          "table_tag) VALUES ($1, $2, $3, $4, $5, $6, '2026-10-20', $7, '{}', $8, $9, $10)",
        [
          newId(),
          a.tenantId,
          a.ids.branch,
          a.ids.device,
          seating.status ?? "draft",
          seating.serviceType ?? "dine_in",
          ++orderNo,
          tableId,
          tableName,
          seating.tableTag ?? null,
        ],
      ),
    ),
  );
}

const freshTable = async () => {
  const id = newId();
  await withTenant(pool, a.tenantId, (client) =>
    client.query("INSERT INTO dining_table (id, tenant_id, area_id, name) VALUES ($1, $2, $3, $4)", [
      id,
      a.tenantId,
      a.ids.area,
      `B${id.slice(-4)}`,
    ]),
  );
  return id;
};

describe("one open order per table", () => {
  it("refuses a second draft at a table, not a closed one beside it nor a draft elsewhere", async () => {
    const table = await freshTable();
    expect(await seat({ tableId: table })).toBe("no-error");
    expect(await seat({ tableId: table })).toBe(UNIQUE_VIOLATION);
    expect(await seat({ tableId: table, status: "cancelled" })).toBe("no-error");
    expect(await seat({ tableId: await freshTable() })).toBe("no-error");
  });

  it("lets any number of counter orders carry the same table tag", async () => {
    const tagged = { tableId: null, tableTag: "12" };
    expect([await seat(tagged), await seat(tagged)]).toEqual(["no-error", "no-error"]);
  });
});

describe("how an order names its table", () => {
  it.each<[string, Seating]>([
    ["a table without the name it had", { tableName: null }],
    ["a table name without a table", { tableId: null, tableName: "B01" }],
    ["both a table and a table tag", { tableTag: "12" }],
    ["a table on a takeaway order", { serviceType: "takeaway" }],
    ["a table tag on a takeaway order", { tableId: null, tableTag: "12", serviceType: "takeaway" }],
    ["a blank table tag", { tableId: null, tableTag: "  " }],
  ])("refuses %s", async (_label, seating) => {
    const tableId = seating.tableId === undefined ? await freshTable() : seating.tableId;
    expect(await seat({ ...seating, tableId })).toBe(CHECK_VIOLATION);
  });
});

describe("a table on the plan", () => {
  it.each([
    ["an unknown shape", "shape = 'hexagon'"],
    ["a place left of the plan", "x = -1"],
    ["no width", "width = 0"],
    ["no seats", "seats = 0"],
    ["a blank name", "name = ' '"],
  ])("refuses %s", async (_label, assignment) => {
    const table = await freshTable();
    const code = await postgresErrorCode(() =>
      withTenant(pool, a.tenantId, (client) =>
        client.query(`UPDATE dining_table SET ${assignment} WHERE id = $1`, [table]),
      ),
    );
    expect(code).toBe(CHECK_VIOLATION);
  });
});
