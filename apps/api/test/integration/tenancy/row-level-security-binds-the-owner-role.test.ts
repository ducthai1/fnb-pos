import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { TENANT_TABLES, type TenantGraph, seedTenantGraph } from "../support/tenant-graph";

// FORCE ROW LEVEL SECURITY is what binds the table owner; without it the owner reads
// every tenant. Jobs and scripts that connect as the owner must stay tenant-scoped too.
const info = inject("testPostgres");

let app: pg.Pool;
let owner: pg.Pool;
let a: TenantGraph;

beforeAll(async () => {
  app = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  owner = new pg.Pool({ connectionString: testConnectionString(info, "owner") });
  a = await seedTenantGraph(app);
  await seedTenantGraph(app);
});

afterAll(async () => {
  await Promise.all([app.end(), owner.end()]);
});

describe.each(TENANT_TABLES)("the owner role on %s", (table) => {
  it("sees only the rows of the tenant it set", async () => {
    const result = await withTenant(owner, a.tenantId, (client) =>
      client.query(`SELECT id, tenant_id FROM ${table}`),
    );
    expect(result.rows).toEqual([{ id: a.ids[table], tenant_id: a.tenantId }]);
  });

  it("sees no rows when it set no tenant", async () => {
    const result = await owner.query(`SELECT count(*)::int AS n FROM ${table}`);
    expect(result.rows).toEqual([{ n: 0 }]);
  });
});
