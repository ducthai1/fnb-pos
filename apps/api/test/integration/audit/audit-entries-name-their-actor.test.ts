import { type AuditActor, appendAudit, newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { postgresErrorCode } from "../support/postgres-error-code";
import { type TenantGraph, seedTenantGraph } from "../support/tenant-graph";

const info = inject("testPostgres");
const CHECK_VIOLATION = "23514";

let app: pg.Pool;
let a: TenantGraph;

beforeAll(async () => {
  app = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  a = await seedTenantGraph(app);
});

afterAll(async () => {
  await app.end();
});

const inA = <T>(work: (client: pg.PoolClient) => Promise<T>) => withTenant(app, a.tenantId, work);

describe("audit entries", () => {
  it.each<AuditActor>([
    { kind: "app_user", id: newId() },
    { kind: "staff", id: newId() },
    { kind: "device", id: newId() },
    { kind: "system" },
  ])("record a $kind actor", async (actor) => {
    const entityId = newId();
    const id = await inA((client) =>
      appendAudit(client, {
        actor,
        action: "config.changed",
        entityKind: "config_value",
        entityId,
        payload: { from: 1_000n, to: 500n },
      }),
    );
    const rows = await inA(async (client) => {
      const result = await client.query(
        "SELECT actor_kind, actor_id, action, entity_kind, entity_id, payload FROM audit_log WHERE id = $1",
        [id],
      );
      return result.rows;
    });
    expect(rows).toEqual([
      {
        actor_kind: actor.kind,
        actor_id: actor.kind === "system" ? null : actor.id,
        action: "config.changed",
        entity_kind: "config_value",
        entity_id: entityId,
        payload: { from: "1000", to: "500" },
      },
    ]);
  });

  const insertActor = (kind: string, actorId: string | null) =>
    inA((client) =>
      postgresErrorCode(() =>
        client.query(
          `INSERT INTO audit_log (id, tenant_id, actor_kind, actor_id, action, entity_kind, entity_id)
           VALUES ($1, $2, $3, $4, 'x', 'x', $5)`,
          [newId(), a.tenantId, kind, actorId, newId()],
        ),
      ),
    );

  it("refuse a named actor without an id, since it would say nothing about who acted", async () => {
    for (const kind of ["app_user", "staff", "device"]) {
      expect({ kind, code: await insertActor(kind, null) }).toEqual({
        kind,
        code: CHECK_VIOLATION,
      });
    }
  });

  it("refuse an id on a system entry and an actor kind nobody defined", async () => {
    expect(await insertActor("system", newId())).toBe(CHECK_VIOLATION);
    expect(await insertActor("customer", newId())).toBe(CHECK_VIOLATION);
  });
});
