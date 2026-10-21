import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { freshTill, rowsOf } from "../support/shift-commands";
import { hireManager } from "../support/sync-approvals";
import {
  SERVER_STARTS_AT,
  line,
  orderIdOf,
  pushOne,
  saveDraft,
  tillsClock,
} from "../support/sync-commands";
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
  app = buildApp({ pool, clock: tillsClock() });
  s = await syncShop(app, pool);
  managerId = await hireManager(app, s);
  // A cashier with no order_discount grant of their own: the discount needs the approval.
  till = await freshTill(app, s);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/** A new draft of one coffee on the till; answers its order id. */
async function coffeeDraft() {
  const draft = saveDraft(till, [line(s.menu.coffee.id)]);
  expect((await pushOne(app, till, draft)).status).toBe("accepted");
  return orderIdOf(draft);
}

/**
 * A 10% discount approval of order `orderId` (of none when null, as approvals were given
 * before they were bound) the manager gave `ago` ms before the server receives the
 * command, by the API's clock, as the approval route records it. Answers its id and when
 * it was given, in epoch ms.
 */
async function approvalGiven(orderId: string | null, ago: number) {
  const approvalId = newId();
  const rows = await rowsOf(
    pool,
    s.shop.tenantId,
    "INSERT INTO approval_log (id, tenant_id, action_key, requested_by_staff_id, " +
      "approved_by_staff_id, device_id, branch_id, payload, created_at) VALUES " +
      "($1, $2, 'order_discount', $3, $4, $5, $6, $7::jsonb, $8) " +
      "RETURNING created_at",
    [
      approvalId,
      s.shop.tenantId,
      till.staffId,
      managerId,
      till.deviceId,
      s.shop.branchId,
      JSON.stringify(
        orderId === null ? { discountRate: RATE } : { discountRate: RATE, subject: { orderId } },
      ),
      new Date(SERVER_STARTS_AT.getTime() - ago),
    ],
  );
  return { approvalId, givenAt: (rows[0]?.created_at as Date).getTime() };
}

/** The order discount of `orderId` relying on `approvalId`, dated `createdAt` by the till. */
function discountRecordedAt(orderId: string, approvalId: string, createdAt: number) {
  const off = discount(till, orderId, {
    scope: "order",
    discount: { kind: "percent", rate: RATE },
  });
  const sent = { ...withApproval(off, approvalId), createdAt: new Date(createdAt).toISOString() };
  return pushOne(app, till, sent);
}

/** A draft and its discount approval given `ago` ms before the server receives the command. */
async function approvedDraft(ago: number) {
  const orderId = await coffeeDraft();
  return { orderId, ...(await approvalGiven(orderId, ago)) };
}

describe("an approval relied on by a till that synced late", () => {
  it("is refused a day after it was given, though the till dated the command a minute after", async () => {
    const { orderId, approvalId, givenAt } = await approvedDraft(24 * HOUR);
    const result = await discountRecordedAt(orderId, approvalId, givenAt + MINUTE);
    expect(result).toMatchObject({ status: "rejected", code: "SYNC_APPROVAL_EXPIRED" });
  });

  // Bound to its order and figures, an approval kept longer still covers only what the
  // manager was shown, so a till offline through an evening rush keeps its approvals.
  it("is honoured for a till that went offline right after and synced three hours later", async () => {
    const { orderId, approvalId, givenAt } = await approvedDraft(3 * HOUR);
    const result = await discountRecordedAt(orderId, approvalId, givenAt + MINUTE);
    expect(result.status).toBe("accepted");
  });

  it("is honoured for a till that synced just within twelve hours", async () => {
    const { orderId, approvalId, givenAt } = await approvedDraft(12 * HOUR - 2 * MINUTE);
    const result = await discountRecordedAt(orderId, approvalId, givenAt + MINUTE);
    expect(result.status).toBe("accepted");
  });

  // A till clock up to two minutes slow is forgiven; earlier is a command recorded before
  // anyone approved it (or a hand-edited one), which no approval may cover.
  it("is honoured for a command a till a little slow dated just before the approval", async () => {
    const { orderId, approvalId, givenAt } = await approvedDraft(10 * MINUTE);
    const result = await discountRecordedAt(orderId, approvalId, givenAt - 2 * MINUTE);
    expect(result.status).toBe("accepted");
  });

  it("is refused for a command dated more than two minutes before it was given", async () => {
    const { orderId, approvalId, givenAt } = await approvedDraft(10 * MINUTE);
    const result = await discountRecordedAt(orderId, approvalId, givenAt - 2 * MINUTE - 1_000);
    expect(result).toMatchObject({ status: "rejected", code: "SYNC_APPROVAL_EXPIRED" });
  });

  it("is refused once the till syncs more than twelve hours after it was given", async () => {
    const { orderId, approvalId, givenAt } = await approvedDraft(12 * HOUR + MINUTE);
    const result = await discountRecordedAt(orderId, approvalId, givenAt + MINUTE);
    expect(result).toMatchObject({ status: "rejected", code: "SYNC_APPROVAL_EXPIRED" });
  });

  it("covers nothing when it names no order, as approvals given before binding did", async () => {
    const orderId = await coffeeDraft();
    const { approvalId, givenAt } = await approvalGiven(null, 10 * MINUTE);
    const result = await discountRecordedAt(orderId, approvalId, givenAt + MINUTE);
    expect(result).toMatchObject({ status: "rejected", code: "SYNC_APPROVAL_FOR_ANOTHER_SUBJECT" });
  });
});
