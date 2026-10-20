import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { kitchenStation, sentToKitchen, ticketLine } from "../support/kitchen-commands";
import { freshTill } from "../support/shift-commands";
import { approve, hireManager } from "../support/sync-approvals";
import { line, orderIdOf, pushOne, saveDraft, tillsClock } from "../support/sync-commands";
import { cancel, voidUnits, withApproval } from "../support/sync-order-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";
import { markPreBillPrinted } from "../support/table-commands";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
let bar: string;
let managerId: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: tillsClock() });
  s = await syncShop(app, pool);
  bar = await kitchenStation(app, s);
  managerId = await hireManager(app, s);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

// The cashier at till A holds no close_unpaid_table; the manager does.
const till = () => s.tillA;

async function coffeeDraft() {
  const coffee = line(s.menu.coffee.id);
  const draft = saveDraft(till(), [coffee]);
  expect((await pushOne(app, till(), draft)).status).toBe("accepted");
  return { orderId: orderIdOf(draft), coffee };
}

/** A draft whose pre-bill the guests were handed. */
async function preBilledDraft() {
  const draft = await coffeeDraft();
  expect((await pushOne(app, till(), markPreBillPrinted(till(), draft.orderId))).status).toBe(
    "accepted",
  );
  return draft;
}

/** A draft the bar was sent and that was then voided in full, with a manager's approval. */
async function servedThenVoidedDraft() {
  const draft = await coffeeDraft();
  const ticket = sentToKitchen(till(), draft.orderId, bar, [ticketLine(draft.coffee.lineId, "1")]);
  expect((await pushOne(app, till(), ticket)).status).toBe("accepted");
  const voidApproval = await approve(app, till(), managerId, { key: "void_after_sent" });
  const voided = withApproval(voidUnits(till(), draft.orderId, draft.coffee.lineId, "1"), voidApproval);
  expect((await pushOne(app, till(), voided)).status).toBe("accepted");
  return draft;
}

const cancelAuditOf = (orderId: string) =>
  withTenant(pool, s.shop.tenantId, async (client) => {
    const { rows } = await client.query(
      "SELECT payload FROM audit_log WHERE action = 'order.cancelled' AND entity_id = $1",
      [orderId],
    );
    return rows.map((row) => row.payload as Record<string, unknown>);
  });

describe("cancelling a draft", () => {
  it("is the cashier's alone while nobody was shown a bill or served", async () => {
    const { orderId } = await coffeeDraft();
    expect((await pushOne(app, till(), cancel(till(), orderId))).status).toBe("accepted");
    expect(await cancelAuditOf(orderId)).toEqual([{ reasonCode: "customer_left" }]);
  });

  it.each([
    ["whose pre-bill was printed", preBilledDraft],
    ["the bar was sent, though all of it was voided since", servedThenVoidedDraft],
  ])("needs a manager for a draft %s", async (_label, made) => {
    const { orderId } = await made();
    const alone = await pushOne(app, till(), cancel(till(), orderId));
    expect(alone).toMatchObject({ status: "rejected", code: "SYNC_APPROVAL_REQUIRED" });
    expect(alone.snapshot?.status).toBe("draft");
    const approvalId = await approve(app, till(), managerId, { key: "close_unpaid_table" });
    const approved = withApproval(cancel(till(), orderId), approvalId);
    expect((await pushOne(app, till(), approved)).status).toBe("accepted");
    expect(await cancelAuditOf(orderId)).toEqual([
      { reasonCode: "customer_left", approvalId, approvedByStaffId: managerId },
    ]);
  });

  it("is not covered by an approval for another action", async () => {
    const { orderId } = await preBilledDraft();
    const approvalId = await approve(app, till(), managerId, { key: "void_after_sent" });
    const refused = await pushOne(app, till(), withApproval(cancel(till(), orderId), approvalId));
    expect(refused.code).toBe("SYNC_APPROVAL_FOR_ANOTHER_ACTION");
  });

  it("needs nobody when the staff member holds close_unpaid_table", async () => {
    const manager = await freshTill(app, s, managerId);
    const draft = saveDraft(manager, [line(s.menu.coffee.id)]);
    expect((await pushOne(app, manager, draft)).status).toBe("accepted");
    const orderId = orderIdOf(draft);
    expect((await pushOne(app, manager, markPreBillPrinted(manager, orderId))).status).toBe(
      "accepted",
    );
    expect((await pushOne(app, manager, cancel(manager, orderId))).status).toBe("accepted");
  });
});
