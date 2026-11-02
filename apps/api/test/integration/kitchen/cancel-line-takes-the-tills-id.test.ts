import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { kitchenStation, sentToKitchen, ticketLine } from "../support/kitchen-commands";
import { approve, hireManager, voidOfSent } from "../support/sync-approvals";
import { line, orderIdOf, push, pushOne, saveDraft, tillsClock } from "../support/sync-commands";
import { voidUnits, withApproval } from "../support/sync-order-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";
import type { OrderSnapshot } from "../../../src/sync/sync-wire-types";

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

/** Three coffees saved and printed for the bar. */
async function coffeesAtTheBar() {
  const coffee = line(s.menu.coffee.id, { quantity: "3" });
  const draft = saveDraft(till(), [coffee]);
  expect((await pushOne(app, till(), draft)).status).toBe("accepted");
  const orderId = orderIdOf(draft);
  const sent = sentToKitchen(till(), orderId, bar, [ticketLine(coffee.lineId, "3", "new")]);
  expect((await pushOne(app, till(), sent)).status).toBe("accepted");
  return { orderId, lineId: coffee.lineId };
}

async function voidOne(orderId: string, lineId: string, reversalLineId?: string) {
  const approvalId = await approve(app, till(), managerId, voidOfSent(orderId, lineId, "1"));
  const sent = voidUnits(till(), orderId, lineId, "1");
  const named = reversalLineId === undefined
    ? sent
    : { ...sent, payload: { ...(sent.payload as object), reversalLineId } };
  return withApproval(named, approvalId);
}

const cancelLinesOf = (snapshot: OrderSnapshot | undefined) =>
  (snapshot?.lines ?? []).filter((candidate) => candidate.reversesLineId !== null);

describe("the cancel line of a void", () => {
  it("takes the id the till printed its ticket under, which the ticket's record then names", async () => {
    const { orderId, lineId } = await coffeesAtTheBar();
    const cancelId = newId();
    // Offline, the till queued the void and the record of the cancel ticket it printed.
    const [voided, recorded] = await push(app, till(), [
      await voidOne(orderId, lineId, cancelId),
      sentToKitchen(till(), orderId, bar, [ticketLine(cancelId, "1", "cancel")]),
    ]);
    expect(voided?.status).toBe("accepted");
    expect(cancelLinesOf(voided?.snapshot).map((cancel) => cancel.id)).toEqual([cancelId]);
    expect(recorded?.status).toBe("accepted");
    // Nothing is owed to the bar any more: the cancel it has is the one the server made.
    expect(cancelLinesOf(recorded?.snapshot)).toEqual([
      expect.objectContaining({ id: cancelId, quantity: "-1", sentQuantity: "1" }),
    ]);
  });

  it("gets an id of the server's own for a till that names none, as before", async () => {
    const { orderId, lineId } = await coffeesAtTheBar();
    const voided = await pushOne(app, till(), await voidOne(orderId, lineId));
    expect(voided.status).toBe("accepted");
    const [cancel] = cancelLinesOf(voided.snapshot);
    expect(cancel?.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("refuses an id a line already has, here or on another order, and changes nothing", async () => {
    const first = await coffeesAtTheBar();
    const second = await coffeesAtTheBar();
    for (const taken of [second.lineId, first.lineId]) {
      const refused = await pushOne(app, till(), await voidOne(second.orderId, second.lineId, taken));
      expect(refused).toMatchObject({ status: "rejected", code: "SYNC_LINE_ID_TAKEN" });
    }
  });
});
