import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { postgresRefusal } from "../support/postgres-error-code";
import { type TenantGraph, seedTenantGraph } from "../support/tenant-graph";

const info = inject("testPostgres");
const RAISE_EXCEPTION = "P0001";

let app: pg.Pool;
let owner: pg.Pool;
let a: TenantGraph;

beforeAll(async () => {
  app = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  owner = new pg.Pool({ connectionString: testConnectionString(info, "owner") });
  a = await seedTenantGraph(app);
});

afterAll(async () => {
  await Promise.all([app.end(), owner.end()]);
});

// One transaction per statement: a refused statement aborts the transaction it ran in.
const asA = (pool: pg.Pool, sql: string, values: readonly unknown[] = []) =>
  withTenant(pool, a.tenantId, (client) => client.query(sql, [...values]));
const refusalOf = async (pool: pg.Pool, sql: string, values: readonly unknown[] = []) =>
  (await postgresRefusal(() => asA(pool, sql, values))).code;

const CLOSE =
  "UPDATE shift SET status = 'closed', closed_at = now(), closed_by_staff_id = $2, " +
  "counted_cash = 380000, expected_cash = 380000, difference = 0, open_orders_carried = 0 " +
  "WHERE id = $1";
const addMove = (shiftId: string) =>
  [
    "INSERT INTO cash_move (id, tenant_id, shift_id, kind, amount, reason, staff_id) " +
      "VALUES ($1, $2, $3, 'in', 1000, 'x', $4)",
    [newId(), a.tenantId, shiftId, a.ids.staff],
  ] as const;

describe("an open shift", () => {
  it("takes cash moves and counts, and can be closed", async () => {
    expect((await asA(app, ...addMove(a.ids.shift))).rowCount).toBe(1);
    expect((await asA(app, CLOSE, [a.ids.shift, a.ids.staff])).rowCount).toBe(1);
  });
});

describe("a closed shift", () => {
  it("refuses any change to its row, from the app role and the owner alike", async () => {
    const rewrite = "UPDATE shift SET counted_cash = 400000, difference = 20000 WHERE id = $1";
    expect(await refusalOf(app, rewrite, [a.ids.shift])).toBe(RAISE_EXCEPTION);
    expect(await refusalOf(owner, rewrite, [a.ids.shift])).toBe(RAISE_EXCEPTION);
    expect(await refusalOf(owner, "DELETE FROM shift WHERE id = $1", [a.ids.shift])).toBe(
      RAISE_EXCEPTION,
    );
  });

  it("refuses new cash moves and changes to its counts", async () => {
    expect(await refusalOf(app, ...addMove(a.ids.shift))).toBe(RAISE_EXCEPTION);
    const recount = "UPDATE shift_count SET pieces = 2 WHERE id = $1";
    expect(await refusalOf(owner, recount, [a.ids.shift_count])).toBe(RAISE_EXCEPTION);
    const unmove = "DELETE FROM cash_move WHERE id = $1";
    expect(await refusalOf(owner, unmove, [a.ids.cash_move])).toBe(RAISE_EXCEPTION);
  });

  it("refuses being closed without its closing figures", async () => {
    const shiftId = newId();
    const code = await refusalOf(
      app,
      "INSERT INTO shift (id, tenant_id, branch_id, status, opened_by_staff_id, opening_cash, " +
        "business_date) VALUES ($1, $2, $3, 'closed', $4, 0, '2026-10-20')",
      [shiftId, a.tenantId, a.ids.branch, a.ids.staff],
    );
    expect(code).toBe("23514");
  });
});
