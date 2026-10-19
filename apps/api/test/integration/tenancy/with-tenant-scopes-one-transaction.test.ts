import { DB_ERROR_CODES, isDatabaseError, newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterEach, beforeEach, describe, expect, inject, it } from "vitest";
import { type TenantGraph, seedTenantGraph } from "../support/tenant-graph";

const info = inject("testPostgres");

// One connection, so every call below provably reuses the connection of the call before.
let single: pg.Pool;
let tenant: TenantGraph;

beforeEach(async () => {
  single = new pg.Pool({ connectionString: testConnectionString(info, "app"), max: 1 });
  tenant = await seedTenantGraph(single);
});

afterEach(async () => {
  await single.end();
});

const brandNamed = (name: string) =>
  withTenant(single, tenant.tenantId, (client) =>
    client.query("SELECT id FROM brand WHERE name = $1", [name]),
  );

const insertBrand = (client: pg.PoolClient, name: string) =>
  client.query("INSERT INTO brand (id, tenant_id, name) VALUES ($1, $2, $3)", [
    newId(),
    tenant.tenantId,
    name,
  ]);

describe("withTenant", () => {
  it("commits the work and returns its result", async () => {
    const result = await withTenant(single, tenant.tenantId, async (client) => {
      await insertBrand(client, "committed");
      return "done";
    });
    expect(result).toBe("done");
    expect((await brandNamed("committed")).rowCount).toBe(1);
  });

  it("rolls back everything when the work throws, and rethrows that same error", async () => {
    const failure = new Error("work failed");
    const outcome = withTenant(single, tenant.tenantId, async (client) => {
      await insertBrand(client, "rolled back");
      throw failure;
    });
    await expect(outcome).rejects.toBe(failure);
    expect((await brandNamed("rolled back")).rowCount).toBe(0);
  });

  it("returns the connection to the pool after a failure", async () => {
    await withTenant(single, tenant.tenantId, () => Promise.reject(new Error("x"))).catch(
      () => undefined,
    );
    const next = await withTenant(single, tenant.tenantId, (client) => client.query("SELECT 1"));
    expect(next.rowCount).toBe(1);
  });

  it("scopes the tenant setting to its transaction only", async () => {
    const read = (client: pg.PoolClient | pg.Pool) =>
      client.query("SELECT current_setting('app.tenant_id', true) AS tenant");
    const inside = await withTenant(single, tenant.tenantId, (client) => read(client));
    const after = await read(single);
    expect(inside.rows).toEqual([{ tenant: tenant.tenantId }]);
    expect(["", null]).toContain(after.rows[0].tenant);
  });

  it.each(["", "acme", "'; RESET app.tenant_id; --", `${newId()}0`])(
    "refuses the tenant id %j without touching the database",
    async (tenantId) => {
      const fresh = new pg.Pool({ connectionString: testConnectionString(info, "app") });
      try {
        let code: string | undefined;
        await withTenant(fresh, tenantId, () => Promise.resolve()).catch((error: unknown) => {
          code = isDatabaseError(error) ? error.code : "not-a-database-error";
        });
        expect({ code, connections: fresh.totalCount }).toEqual({
          code: DB_ERROR_CODES.invalidTenantId,
          connections: 0,
        });
      } finally {
        await fresh.end();
      }
    },
  );
});
