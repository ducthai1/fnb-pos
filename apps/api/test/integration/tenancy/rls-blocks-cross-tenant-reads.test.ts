import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { postgresErrorCode } from "../support/postgres-error-code";
import {
  TENANT_TABLES,
  type TenantGraph,
  insertRow,
  seedTenantGraph,
} from "../support/tenant-graph";

// Everything here runs as the app role, the role the API uses. The owner role is
// deliberately absent: what matters is what a request can do, not what a migration can.
const info = inject("testPostgres");
const appUrl = testConnectionString(info, "app");
const INSUFFICIENT_PRIVILEGE = "42501";

let app: pg.Pool;
let a: TenantGraph;
let b: TenantGraph;

beforeAll(async () => {
  app = new pg.Pool({ connectionString: appUrl });
  a = await seedTenantGraph(app);
  b = await seedTenantGraph(app);
});

afterAll(async () => {
  await app.end();
});

const asA = <T>(work: (client: pg.PoolClient) => Promise<T>) => withTenant(app, a.tenantId, work);
const asB = <T>(work: (client: pg.PoolClient) => Promise<T>) => withTenant(app, b.tenantId, work);

describe.each(TENANT_TABLES)("row level security on %s", (table) => {
  it("shows tenant A exactly its own row, so the empty results below come from the policy", async () => {
    const result = await asA((client) => client.query(`SELECT id, tenant_id FROM ${table}`));
    expect(result.rows).toEqual([{ id: a.ids[table], tenant_id: a.tenantId }]);
  });

  it("hides tenant B's row from tenant A, by id and in counts", async () => {
    const seen = await asA(async (client) => ({
      byId: (await client.query(`SELECT id FROM ${table} WHERE id = $1`, [b.ids[table]])).rowCount,
      counted: (
        await client.query(`SELECT count(*)::int AS n FROM ${table} WHERE tenant_id = $1`, [
          b.tenantId,
        ])
      ).rows[0].n,
    }));
    expect(seen).toEqual({ byId: 0, counted: 0 });
  });

  it("lets tenant A update nothing of tenant B", async () => {
    const updated = await asA((client) =>
      client.query(`UPDATE ${table} SET version = version + 1 WHERE id = $1`, [b.ids[table]]),
    );
    const after = await asB((client) =>
      client.query(`SELECT version FROM ${table} WHERE id = $1`, [b.ids[table]]),
    );
    expect({ updated: updated.rowCount, after: after.rows }).toEqual({
      updated: 0,
      after: [{ version: 1 }],
    });
  });

  it("lets tenant A delete nothing of tenant B", async () => {
    const deleted = await asA((client) =>
      client.query(`DELETE FROM ${table} WHERE id = $1`, [b.ids[table]]),
    );
    const after = await asB((client) =>
      client.query(`SELECT id FROM ${table} WHERE id = $1`, [b.ids[table]]),
    );
    expect({ deleted: deleted.rowCount, remaining: after.rowCount }).toEqual({
      deleted: 0,
      remaining: 1,
    });
  });

  it("rejects an insert by tenant A that carries tenant B's id", async () => {
    const { sql, values } = insertRow(table, b.tenantId, b);
    const code = await asA((client) => postgresErrorCode(() => client.query(sql, values)));
    expect(code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it("rejects tenant A moving its own row over to tenant B", async () => {
    const code = await asA((client) =>
      postgresErrorCode(() =>
        client.query(`UPDATE ${table} SET tenant_id = $1 WHERE id = $2`, [
          b.tenantId,
          a.ids[table],
        ]),
      ),
    );
    expect(code).toBe(INSUFFICIENT_PRIVILEGE);
  });
});

describe("the app role without a tenant", () => {
  it.each(TENANT_TABLES)("sees no rows at all in %s", async (table) => {
    const result = await app.query(`SELECT count(*)::int AS n FROM ${table}`);
    expect(result.rows).toEqual([{ n: 0 }]);
  });

  it("sees nothing on a pooled connection that has just served a tenant", async () => {
    const single = new pg.Pool({ connectionString: appUrl, max: 1 });
    try {
      await withTenant(single, a.tenantId, (client) => client.query("SELECT 1"));
      const counts: number[] = [];
      for (const table of TENANT_TABLES) {
        counts.push((await single.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n);
      }
      expect(counts).toEqual(TENANT_TABLES.map(() => 0));
    } finally {
      await single.end();
    }
  });

  it("cannot write a row, even one for an existing tenant", async () => {
    const { sql, values } = insertRow("brand", a.tenantId, a);
    expect(await postgresErrorCode(() => app.query(sql, values))).toBe(INSUFFICIENT_PRIVILEGE);
  });
});

describe("the schema catalog", () => {
  it("enables and forces row level security with one tenant policy on every table", async () => {
    const result = await app.query(`
      SELECT c.relname AS table, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced,
             p.cmd, p.qual, p.with_check
      FROM pg_class c
      LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = c.relname
      WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
      ORDER BY c.relname`);
    expect(result.rows.map((row) => row.table)).toEqual([...TENANT_TABLES]);
    for (const row of result.rows) {
      expect({ table: row.table, enabled: row.enabled, forced: row.forced, cmd: row.cmd }).toEqual({
        table: row.table,
        enabled: true,
        forced: true,
        cmd: "ALL",
      });
      expect(row.qual).toMatch(/^\(tenant_id = \(NULLIF\(current_setting\('app\.tenant_id'/);
      expect(row.with_check).toBe(row.qual);
    }
  });
});
