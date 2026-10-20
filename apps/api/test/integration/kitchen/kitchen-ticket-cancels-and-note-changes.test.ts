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
import { approve, hireManager } from "../support/sync-approvals";
import { line, orderIdOf, pushOne, saveDraft, tillsClock } from "../support/sync-commands";
import { voidUnits, withApproval } from "../support/sync-order-commands";
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
const send = (orderId: string, lines: ReturnType<typeof ticketLine>[]) =>
  pushOne(app, till(), sentToKitchen(till(), orderId, bar, lines));

/** Two coffees with an extra shot each and `note`, both printed for the bar. */
async function twoCoffeesAtTheBar(note: string | null = null) {
  const shot = {
    groupId: s.menu.coffee.extrasGroup,
    optionId: s.menu.coffee.extraShot,
    quantity: 1,
  };
  const coffee = line(s.menu.coffee.id, { quantity: "2", modifiers: [shot], note });
  const draft = saveDraft(till(), [coffee]);
  expect((await pushOne(app, till(), draft)).status).toBe("accepted");
  const orderId = orderIdOf(draft);
  expect((await send(orderId, [ticketLine(coffee.lineId, "2", "new", note)])).status).toBe(
    "accepted",
  );
  return { orderId, coffee };
}

describe("cancel tickets", () => {
  it("records the cancel of a sent unit voided afterwards, once", async () => {
    const { orderId, coffee } = await twoCoffeesAtTheBar();
    const approvalId = await approve(app, till(), managerId, { key: "void_after_sent" });
    const voided = await pushOne(
      app,
      till(),
      withApproval(voidUnits(till(), orderId, coffee.lineId, "1"), approvalId),
    );
    const cancelLine = voided.snapshot?.lines.find(
      (entry) => entry.reversesLineId === coffee.lineId,
    );
    const cancelId = cancelLine?.id ?? "";
    expect(cancelLine?.sentQuantity).toBe("0");
    expect((await send(orderId, [ticketLine(coffee.lineId, "1", "new")])).code).toBe(
      "SYNC_KITCHEN_NOT_OWED",
    );
    expect((await send(orderId, [ticketLine(cancelId, "1", "cancel")])).status).toBe("accepted");
    expect(await sentStateOf(pool, s.shop.tenantId, orderId)).toEqual([
      { id: coffee.lineId, sent: "2.000", note: null },
      { id: cancelId, sent: "1.000", note: null },
    ]);
    const tickets = await ticketLinesOf(pool, s.shop.tenantId, orderId);
    expect(tickets.at(-1)).toMatchObject({
      kind: "cancel",
      line_id: cancelId,
      detail: { children: [{ name: "Thêm shot", quantity: "1" }] },
    });
    expect((await send(orderId, [ticketLine(cancelId, "1", "cancel")])).code).toBe(
      "SYNC_KITCHEN_NOT_OWED",
    );
  });
});

describe("notes on a ticket", () => {
  it("keeps the note the stations were shown", async () => {
    const { orderId, coffee } = await twoCoffeesAtTheBar("ít đá");
    expect(await sentStateOf(pool, s.shop.tenantId, orderId)).toEqual([
      { id: coffee.lineId, sent: "2.000", note: "ít đá" },
    ]);
  });

  it("records the note as printed, so a stale one is owed again as a note change", async () => {
    const coffee = line(s.menu.coffee.id, { quantity: "2", note: "ít đá" });
    const draft = saveDraft(till(), [coffee]);
    await pushOne(app, till(), draft);
    const orderId = orderIdOf(draft);
    // The till printed from a copy older than the note on the server.
    expect((await send(orderId, [ticketLine(coffee.lineId, "2", "new", "nhiều đá")])).status).toBe(
      "accepted",
    );
    const tooMany = ticketLine(coffee.lineId, "3", "note_changed", "ít đá");
    expect((await send(orderId, [tooMany])).code).toBe("SYNC_KITCHEN_NOT_OWED");
    const changed = ticketLine(coffee.lineId, "2", "note_changed", "ít đá");
    expect((await send(orderId, [changed])).status).toBe("accepted");
    expect(await sentStateOf(pool, s.shop.tenantId, orderId)).toEqual([
      { id: coffee.lineId, sent: "2.000", note: "ít đá" },
    ]);
    expect((await send(orderId, [changed])).code).toBe("SYNC_KITCHEN_NOT_OWED");
    const tickets = await ticketLinesOf(pool, s.shop.tenantId, orderId);
    expect(tickets.at(-1)?.detail).toMatchObject({ previousNote: "nhiều đá" });
  });
});
