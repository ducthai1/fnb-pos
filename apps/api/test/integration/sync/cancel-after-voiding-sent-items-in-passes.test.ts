import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { kitchenStation, sentToKitchen, ticketLine } from "../support/kitchen-commands";
import { approve, closeUnpaid, hireManager, voidOfSent } from "../support/sync-approvals";
import { line, orderIdOf, pushOne, saveDraft, tillsClock } from "../support/sync-commands";
import { cancel, voidUnits, withApproval } from "../support/sync-order-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

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

const till = () => s.tillA;

/** Two coffees sent to the bar, then voided one unit per pass, each pass with its cancel ticket. */
async function voidedInPasses(passes: number) {
  const coffee = line(s.menu.coffee.id, { quantity: "2" });
  const draft = saveDraft(till(), [coffee]);
  expect((await pushOne(app, till(), draft)).status).toBe("accepted");
  const orderId = orderIdOf(draft);
  const ticket = sentToKitchen(till(), orderId, bar, [ticketLine(coffee.lineId, "2")]);
  expect((await pushOne(app, till(), ticket)).status).toBe("accepted");
  for (let pass = 0; pass < passes; pass += 1) {
    const approvalId = await approve(
      app,
      till(),
      managerId,
      voidOfSent(orderId, coffee.lineId, "1"),
    );
    const voided = await pushOne(
      app,
      till(),
      withApproval(voidUnits(till(), orderId, coffee.lineId, "1"), approvalId),
    );
    expect(voided.status).toBe("accepted");
    const cancelLine = voided.snapshot?.lines.find(
      (entry) => entry.reversesLineId === coffee.lineId && entry.sentQuantity === "0",
    );
    const cancelTicket = sentToKitchen(till(), orderId, bar, [
      ticketLine(cancelLine?.id ?? "", "1", "cancel"),
    ]);
    expect((await pushOne(app, till(), cancelTicket)).status).toBe("accepted");
  }
  return orderId;
}

describe("cancelling an order whose sent items were all voided, in several passes", () => {
  it.each([1, 2])("settles after %i void pass(es)", async (passes) => {
    const orderId = await voidedInPasses(passes === 1 ? 1 : 2);
    if (passes === 1) {
      // One unit still stands at the bar: the order cannot be closed over food it made.
      const refused = await pushOne(app, till(), cancel(till(), orderId));
      expect(refused.code).toBe("SYNC_ORDER_HAS_SENT_ITEMS");
      return;
    }
    const alone = await pushOne(app, till(), cancel(till(), orderId));
    expect(alone.code).toBe("SYNC_APPROVAL_REQUIRED");
    const approvalId = await approve(app, till(), managerId, closeUnpaid(orderId));
    const approved = await pushOne(app, till(), withApproval(cancel(till(), orderId), approvalId));
    expect(approved.status).toBe("accepted");
  });
});
