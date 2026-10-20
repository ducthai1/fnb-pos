import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import {
  kitchenStation,
  sentStateOf,
  sentToKitchen,
  ticketLine,
  ticketLinesOf,
} from "../support/kitchen-commands";
import { type LineIntent, line, orderIdOf, pushOne, saveDraft } from "../support/sync-commands";
import { type SyncShop, type Till, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
let bar: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  s = await syncShop(app, pool);
  bar = await kitchenStation(app, s);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const sentOf = (orderId: string) => sentStateOf(pool, s.shop.tenantId, orderId);

/** A draft of `quantity` coffees on `till`, pushed and accepted. */
async function coffees(quantity: string, till: Till = s.tillA) {
  const coffee = line(s.menu.coffee.id, { quantity });
  const draft = saveDraft(till, [coffee]);
  expect((await pushOne(app, till, draft)).status).toBe("accepted");
  return { orderId: orderIdOf(draft), coffee, draft };
}

/** The same draft saved again with `coffee` at another quantity. */
async function resave(till: Till, draft: ReturnType<typeof saveDraft>, coffee: LineIntent) {
  const order = draft.payload as { orderId: string; deviceOrderNo: number };
  const again = saveDraft(till, [coffee], order);
  expect((await pushOne(app, till, again)).status).toBe("accepted");
}

describe("order.mark_sent_to_kitchen", () => {
  it("records the ticket a till printed and moves the line's sent state", async () => {
    const { orderId, coffee } = await coffees("2");
    const result = await pushOne(
      app,
      s.tillA,
      sentToKitchen(s.tillA, orderId, bar, [ticketLine(coffee.lineId, "2")]),
    );
    expect(result.status).toBe("accepted");
    expect(result.snapshot?.lines[0]).toMatchObject({ sentQuantity: "2", sentNote: null });
    expect(await sentOf(orderId)).toEqual([{ id: coffee.lineId, sent: "2.000", note: null }]);
    expect(await ticketLinesOf(pool, s.shop.tenantId, orderId)).toMatchObject([
      {
        line_id: coffee.lineId,
        station_id: bar,
        kind: "new",
        quantity: "2.000",
        staff_id: s.tillA.staffId,
        detail: { name: "Cà phê sữa", previousNote: null, children: [] },
      },
    ]);
  });

  it("takes only the units added since on the second round", async () => {
    const { orderId, coffee, draft } = await coffees("2");
    await pushOne(
      app,
      s.tillA,
      sentToKitchen(s.tillA, orderId, bar, [ticketLine(coffee.lineId, "2")]),
    );
    await resave(s.tillA, draft, { ...coffee, quantity: "3" });
    const whole = sentToKitchen(s.tillA, orderId, bar, [ticketLine(coffee.lineId, "3")]);
    expect((await pushOne(app, s.tillA, whole)).code).toBe("SYNC_KITCHEN_NOT_OWED");
    const added = sentToKitchen(s.tillA, orderId, bar, [ticketLine(coffee.lineId, "1")]);
    expect((await pushOne(app, s.tillA, added)).status).toBe("accepted");
    expect(await sentOf(orderId)).toEqual([{ id: coffee.lineId, sent: "3.000", note: null }]);
    const tickets = await ticketLinesOf(pool, s.shop.tenantId, orderId);
    expect(tickets.map((ticket) => ticket.quantity)).toEqual(["2.000", "1.000"]);
  });

  it("refuses more units than the order holds, and records nothing of that ticket", async () => {
    const { orderId, coffee } = await coffees("2");
    const tooMany = sentToKitchen(s.tillA, orderId, bar, [ticketLine(coffee.lineId, "2.001")]);
    expect(await pushOne(app, s.tillA, tooMany)).toMatchObject({
      status: "rejected",
      code: "SYNC_KITCHEN_NOT_OWED",
    });
    expect(await sentOf(orderId)).toEqual([{ id: coffee.lineId, sent: "0.000", note: null }]);
    expect(await ticketLinesOf(pool, s.shop.tenantId, orderId)).toEqual([]);
  });

  it.each([
    ["a cancel of units nobody voided", (lineId: string) => ticketLine(lineId, "1", "cancel")],
    [
      "a note change on units never sent",
      (lineId: string) => ticketLine(lineId, "1", "note_changed"),
    ],
    ["a line of another order", () => ticketLine(newId(), "1")],
  ])("refuses %s", async (_label, printed) => {
    const { orderId, coffee } = await coffees("2");
    const sent = sentToKitchen(s.tillA, orderId, bar, [printed(coffee.lineId)]);
    expect((await pushOne(app, s.tillA, sent)).code).toBe("SYNC_KITCHEN_NOT_OWED");
  });

  it("takes a ticket carrying fewer units than owed, when the order grew on another till", async () => {
    const { orderId, coffee, draft } = await coffees("1");
    // Till B adds a coffee and syncs before till A reports the ticket it printed for one.
    await resave(s.tillB, draft, { ...coffee, quantity: "2" });
    const printed = sentToKitchen(s.tillA, orderId, bar, [ticketLine(coffee.lineId, "1")]);
    expect((await pushOne(app, s.tillA, printed)).status).toBe("accepted");
    expect(await sentOf(orderId)).toEqual([{ id: coffee.lineId, sent: "1.000", note: null }]);
  });

  it("answers the same command sent again as before, and refuses its ticket id on another", async () => {
    const { orderId, coffee } = await coffees("2");
    const first = sentToKitchen(s.tillA, orderId, bar, [ticketLine(coffee.lineId, "1")]);
    const accepted = await pushOne(app, s.tillA, first);
    expect(await pushOne(app, s.tillA, first)).toEqual(accepted);
    const ticketId = (first.payload as { ticketId: string }).ticketId;
    const reused = sentToKitchen(s.tillA, orderId, bar, [ticketLine(coffee.lineId, "1")], ticketId);
    expect((await pushOne(app, s.tillA, reused)).code).toBe("SYNC_KITCHEN_TICKET_ID_TAKEN");
    expect(await sentOf(orderId)).toEqual([{ id: coffee.lineId, sent: "1.000", note: null }]);
  });

  it("refuses a station of another branch, and an order of another branch", async () => {
    const { orderId, coffee } = await coffees("1");
    const elsewhere = await kitchenStation(app, s, "Bếp", s.shop.otherBranchId);
    const printed = [ticketLine(coffee.lineId, "1")];
    const atOther = sentToKitchen(s.tillA, orderId, elsewhere, printed);
    expect((await pushOne(app, s.tillA, atOther)).code).toBe("SYNC_KITCHEN_STATION_NOT_FOUND");
    const fromOther = sentToKitchen(s.otherBranchTill, orderId, elsewhere, printed);
    expect((await pushOne(app, s.otherBranchTill, fromOther)).code).toBe("SYNC_ORDER_NOT_FOUND");
    const kept = await withTenant(pool, s.shop.tenantId, (client) =>
      client.query("SELECT count(*)::int AS n FROM kitchen_ticket WHERE order_id = $1", [orderId]),
    );
    expect(kept.rows[0].n).toBe(0);
  });
});
