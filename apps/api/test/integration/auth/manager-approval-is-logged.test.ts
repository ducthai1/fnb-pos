import { type ApprovalRecord, newId, recordApproval, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { postgresErrorCode, postgresRefusal } from "../support/postgres-error-code";
import { APPEND_ONLY_TABLES, type TenantGraph, seedTenantGraph } from "../support/tenant-graph";

const info = inject("testPostgres");
const INSUFFICIENT_PRIVILEGE = "42501";
const CHECK_VIOLATION = "23514";
const RAISE_EXCEPTION = "P0001";

let app: pg.Pool;
let owner: pg.Pool;
let a: TenantGraph;
let b: TenantGraph;

beforeAll(async () => {
  app = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  owner = new pg.Pool({ connectionString: testConnectionString(info, "owner") });
  a = await seedTenantGraph(app);
  b = await seedTenantGraph(app);
});

afterAll(async () => {
  await Promise.all([app.end(), owner.end()]);
});

const discountApproval = (overrides: Partial<ApprovalRecord> = {}): ApprovalRecord => ({
  actionKey: "line_discount",
  requestedByStaffId: newId(),
  approvedByStaffId: newId(),
  deviceId: a.ids.device,
  branchId: a.ids.branch,
  payload: { orderId: newId(), discountRate: 2_000, amount: 9_000n },
  ...overrides,
});

const approvalRows = (pool: pg.Pool, tenantId: string, id: string) =>
  withTenant(pool, tenantId, async (client) => {
    const result = await client.query(
      `SELECT action_key, requested_by_staff_id, approved_by_staff_id, device_id, branch_id,
              payload FROM approval_log WHERE id = $1`,
      [id],
    );
    return result.rows;
  });

describe("a manager approval granted at the till", () => {
  it("records who asked, who approved, on which till and branch, and what", async () => {
    const approval = discountApproval();
    const id = await withTenant(app, a.tenantId, (client) => recordApproval(client, approval));
    expect(await approvalRows(app, a.tenantId, id)).toEqual([
      {
        action_key: "line_discount",
        requested_by_staff_id: approval.requestedByStaffId,
        approved_by_staff_id: approval.approvedByStaffId,
        device_id: a.ids.device,
        branch_id: a.ids.branch,
        // Money goes in as a decimal string, so it reads back exact.
        payload: { ...approval.payload, amount: "9000" },
      },
    ]);
  });

  it("keeps the id the till generated, so a synced approval is not recorded twice", async () => {
    const id = newId();
    await withTenant(app, a.tenantId, (client) => recordApproval(client, discountApproval({ id })));
    const again = await withTenant(app, a.tenantId, (client) =>
      postgresErrorCode(() => recordApproval(client, discountApproval({ id }))),
    );
    expect({ again, rows: (await approvalRows(app, a.tenantId, id)).length }).toEqual({
      again: "23505",
      rows: 1,
    });
  });

  it("disappears with the action it approved when that transaction rolls back", async () => {
    const id = newId();
    const failed = withTenant(app, a.tenantId, async (client) => {
      await recordApproval(client, discountApproval({ id }));
      throw new Error("the discount could not be applied");
    });
    await expect(failed).rejects.toThrow("could not be applied");
    expect(await approvalRows(app, a.tenantId, id)).toEqual([]);
  });

  it("refuses an approval granted by the requester themself", async () => {
    const staff = newId();
    const code = await withTenant(app, a.tenantId, (client) =>
      postgresErrorCode(() =>
        recordApproval(
          client,
          discountApproval({ requestedByStaffId: staff, approvedByStaffId: staff }),
        ),
      ),
    );
    expect(code).toBe(CHECK_VIOLATION);
  });

  it("cannot be recorded outside a tenant transaction", async () => {
    const client = await app.connect();
    try {
      expect(await postgresErrorCode(() => recordApproval(client, discountApproval()))).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
    } finally {
      client.release();
    }
  });

  it("is invisible to another tenant, while its own tenant sees it", async () => {
    const id = await withTenant(app, a.tenantId, (client) =>
      recordApproval(client, discountApproval()),
    );
    expect({
      own: (await approvalRows(app, a.tenantId, id)).length,
      other: (await approvalRows(app, b.tenantId, id)).length,
    }).toEqual({ own: 1, other: 0 });
  });
});

describe.each(APPEND_ONLY_TABLES)("%s is append-only", (table) => {
  const CHANGES = [
    `UPDATE ${table} SET payload = '{"forged": true}' WHERE id = $1`,
    `DELETE FROM ${table} WHERE id = $1`,
  ];

  const stillThere = async () =>
    withTenant(app, a.tenantId, async (client) => {
      const result = await client.query(`SELECT payload FROM ${table} WHERE id = $1`, [
        a.ids[table],
      ]);
      return result.rows;
    });

  it("grants the app role reading and adding only", async () => {
    const result = await app.query(
      `SELECT p.privilege, has_table_privilege(current_user, $1, p.privilege) AS held
       FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS p(privilege)`,
      [table],
    );
    expect(Object.fromEntries(result.rows.map((row) => [row.privilege, row.held]))).toEqual({
      SELECT: true,
      INSERT: true,
      UPDATE: false,
      DELETE: false,
      TRUNCATE: false,
    });
  });

  it("refuses the app role changing or removing even its own tenant's row", async () => {
    // One transaction per attempt: a refused statement aborts the transaction it ran in.
    const codes: string[] = [];
    for (const sql of CHANGES) {
      codes.push(
        await withTenant(app, a.tenantId, (client) =>
          postgresErrorCode(() => client.query(sql, [a.ids[table]])),
        ),
      );
    }
    const truncate = await postgresErrorCode(() => app.query(`TRUNCATE ${table}`));
    expect([...codes, truncate]).toEqual([
      INSUFFICIENT_PRIVILEGE,
      INSUFFICIENT_PRIVILEGE,
      INSUFFICIENT_PRIVILEGE,
    ]);
    expect(await stillThere()).toEqual([{ payload: {} }]);
  });

  it("refuses the schema owner too, which privileges alone could not stop", async () => {
    const seen = await withTenant(owner, a.tenantId, async (client) => {
      const result = await client.query(`SELECT id FROM ${table} WHERE id = $1`, [a.ids[table]]);
      return result.rowCount;
    });
    const refused = [];
    for (const sql of CHANGES) {
      refused.push(
        await withTenant(owner, a.tenantId, (client) =>
          postgresRefusal(() => client.query(sql, [a.ids[table]])),
        ),
      );
    }
    // TRUNCATE ignores row level security, so it would reach every tenant at once.
    refused.push(await postgresRefusal(() => owner.query(`TRUNCATE ${table}`)));
    expect(seen).toBe(1);
    for (const outcome of refused) {
      expect(outcome.code).toBe(RAISE_EXCEPTION);
      expect(outcome.message).toMatch(new RegExp(`^${table} is append-only`));
    }
    expect(await stillThere()).toEqual([{ payload: {} }]);
  });
});
