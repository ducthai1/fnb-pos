import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { freshTill, rowsOf } from "../support/shift-commands";
import { hireManager } from "../support/sync-approvals";
import { line, orderIdOf, pushOne, saveDraft } from "../support/sync-commands";
import { discount, withApproval } from "../support/sync-order-commands";
import { type SyncShop, type Till, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const RATE = 1000;

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
let managerId: string;
let till: Till;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  s = await syncShop(app, pool);
  managerId = await hireManager(app, s);
  // A cashier with no order_discount grant of their own: the discount needs the approval.
  till = await freshTill(app, s);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/**
 * A 10% order discount approval the manager gave `ago` ms back by the database's clock, as
 * the approval route records it. Answers its id and when it was given, in epoch ms.
 */
async function approvalGiven(ago: number) {
  const approvalId = newId();
  const rows = await rowsOf(
    pool,
    s.shop.tenantId,
    "INSERT INTO approval_log (id, tenant_id, action_key, requested_by_staff_id, " +
      "approved_by_staff_id, device_id, branch_id, payload, created_at) VALUES " +
      "($1, $2, 'order_discount', $3, $4, $5, $6, $7::jsonb, now() - make_interval(secs => $8)) " +
      "RETURNING created_at",
    [
      approvalId,
      s.shop.tenantId,
      till.staffId,
      managerId,
      till.deviceId,
      s.shop.branchId,
      JSON.stringify({ discountRate: RATE }),
      ago / 1000,
    ],
  );
  return { approvalId, givenAt: (rows[0]?.created_at as Date).getTime() };
}

/** A new draft's order discount relying on `approvalId`, dated `createdAt` by the till. */
async function discountRecordedAt(approvalId: string, createdAt: number) {
  const draft = saveDraft(till, [line(s.menu.coffee.id)]);
  expect((await pushOne(app, till, draft)).status).toBe("accepted");
  const off = discount(till, orderIdOf(draft), {
    scope: "order",
    discount: { kind: "percent", rate: RATE },
  });
  const sent = { ...withApproval(off, approvalId), createdAt: new Date(createdAt).toISOString() };
  return pushOne(app, till, sent);
}

describe("an approval relied on by a till that synced late", () => {
  it("is refused a day after it was given, though the till dated the command a minute after", async () => {
    const { approvalId, givenAt } = await approvalGiven(24 * HOUR);
    const result = await discountRecordedAt(approvalId, givenAt + MINUTE);
    expect(result).toMatchObject({ status: "rejected", code: "SYNC_APPROVAL_EXPIRED" });
  });

  it("is honoured for a till that went offline right after and synced within two hours", async () => {
    const { approvalId, givenAt } = await approvalGiven(2 * HOUR - 2 * MINUTE);
    const result = await discountRecordedAt(approvalId, givenAt + MINUTE);
    expect(result.status).toBe("accepted");
  });

  it("is refused once the till syncs more than two hours after it was given", async () => {
    const { approvalId, givenAt } = await approvalGiven(2 * HOUR + MINUTE);
    const result = await discountRecordedAt(approvalId, givenAt + MINUTE);
    expect(result).toMatchObject({ status: "rejected", code: "SYNC_APPROVAL_EXPIRED" });
  });
});
