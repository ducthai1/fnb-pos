import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { postgresErrorCode } from "../support/postgres-error-code";
import {
  CHILD_TABLES,
  type TenantGraph,
  insertRow,
  seedTenantGraph,
} from "../support/tenant-graph";

// Foreign key checks bypass row level security, so only the (tenant_id, parent_id) keys
// stop a tenant from hanging its rows under a parent owned by someone else.
const info = inject("testPostgres");
const FOREIGN_KEY_VIOLATION = "23503";
const CHECK_VIOLATION = "23514";

let app: pg.Pool;
let a: TenantGraph;
let b: TenantGraph;

beforeAll(async () => {
  app = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  a = await seedTenantGraph(app);
  b = await seedTenantGraph(app);
});

afterAll(async () => {
  await app.end();
});

describe.each(CHILD_TABLES)("a %s row", (table) => {
  it("can point at a parent of its own tenant", async () => {
    const { sql, values } = insertRow(table, a.tenantId, a);
    const result = await withTenant(app, a.tenantId, (client) => client.query(sql, values));
    expect(result.rowCount).toBe(1);
  });

  it("cannot point at a parent of another tenant, even knowing its id", async () => {
    const { sql, values } = insertRow(table, a.tenantId, b);
    const code = await withTenant(app, a.tenantId, (client) =>
      postgresErrorCode(() => client.query(sql, values)),
    );
    expect(code).toBe(FOREIGN_KEY_VIOLATION);
  });
});

describe("tenant roots", () => {
  it.each(["brand", "app_user", "role"] as const)(
    "a %s cannot be created for a tenant that has no organization",
    async (table) => {
      const orphanTenant = newId();
      const { sql, values } = insertRow(table, orphanTenant, a);
      const code = await withTenant(app, orphanTenant, (client) =>
        postgresErrorCode(() => client.query(sql, values)),
      );
      expect(code).toBe(FOREIGN_KEY_VIOLATION);
    },
  );

  it("an organization must be its own tenant", async () => {
    const tenantId = newId();
    const code = await withTenant(app, tenantId, (client) =>
      postgresErrorCode(() =>
        client.query("INSERT INTO organization (id, tenant_id, name) VALUES ($1, $2, 'x')", [
          newId(),
          tenantId,
        ]),
      ),
    );
    expect(code).toBe(CHECK_VIOLATION);
  });
});

describe("branch clock settings", () => {
  const insertBranch = (columns: Record<string, number>) => {
    const names = Object.keys(columns);
    const sql =
      `INSERT INTO branch (id, tenant_id, brand_id, name${names.map((n) => `, ${n}`).join("")}) ` +
      `VALUES ($1, $2, $3, 'x'${names.map((_, i) => `, $${i + 4}`).join("")}) ` +
      "RETURNING utc_offset_minutes, business_day_start_minute";
    return withTenant(app, a.tenantId, (client) =>
      client.query(sql, [newId(), a.tenantId, a.ids.brand, ...Object.values(columns)]),
    );
  };

  it("default to Vietnam time and a business day starting at 04:00", async () => {
    const result = await insertBranch({});
    expect(result.rows).toEqual([{ utc_offset_minutes: 420, business_day_start_minute: 240 }]);
  });

  it.each([
    { utc_offset_minutes: -720 },
    { utc_offset_minutes: 840 },
    { business_day_start_minute: 0 },
    { business_day_start_minute: 1439 },
  ])("accept the boundary value %o", async (columns) => {
    expect((await insertBranch(columns)).rowCount).toBe(1);
  });

  it.each([
    { utc_offset_minutes: -721 },
    { utc_offset_minutes: 841 },
    { business_day_start_minute: -1 },
    { business_day_start_minute: 1440 },
  ])("reject the out-of-range value %o", async (columns) => {
    expect(await postgresErrorCode(() => insertBranch(columns))).toBe(CHECK_VIOLATION);
  });
});
