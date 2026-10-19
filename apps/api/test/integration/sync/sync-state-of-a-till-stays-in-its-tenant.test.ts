import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { postgresErrorCode } from "../support/postgres-error-code";
import { type TenantGraph, seedTenantGraph } from "../support/tenant-graph";

// The generic cross-tenant test cannot cover device_sync_state: its one parent is a till,
// and the graph's till already has the single state row it may have.
const info = inject("testPostgres");
const FOREIGN_KEY_VIOLATION = "23503";

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

const insertState = (deviceId: string) =>
  withTenant(app, a.tenantId, (client) =>
    postgresErrorCode(() =>
      client.query(
        "INSERT INTO device_sync_state (id, tenant_id, device_id, last_seq) VALUES ($1, $2, $3, 0)",
        [newId(), a.tenantId, deviceId],
      ),
    ),
  );

describe("device_sync_state", () => {
  it("can track a till of its own tenant", async () => {
    const tillId = newId();
    await withTenant(app, a.tenantId, (client) =>
      client.query("INSERT INTO device (id, tenant_id, branch_id, name) VALUES ($1, $2, $3, 'x')", [
        tillId,
        a.tenantId,
        a.ids.branch,
      ]),
    );
    expect(await insertState(tillId)).toBe("no-error");
  });

  it("cannot track another tenant's till, even knowing its id", async () => {
    expect(await insertState(b.ids.device)).toBe(FOREIGN_KEY_VIOLATION);
  });

  it("keeps one state per till", async () => {
    expect(await insertState(a.ids.device)).toBe("23505");
  });
});
