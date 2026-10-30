import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { expectStatus } from "../support/catalog-shop";
import {
  kitchenStation,
  sentStateOf,
  sentToKitchen,
  ticketLine,
  ticketLinesOf,
} from "../support/kitchen-commands";
import { approve, hireManager, voidOfSent } from "../support/sync-approvals";
import { line, orderIdOf, pushOne, saveDraft, tillsClock } from "../support/sync-commands";
import { voidUnits, withApproval } from "../support/sync-order-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
let bar: string;
let managerId: string;
/** Coffee beans at 32.000 đ per 100 g: 351 g is the quantity "3.51". */
const beans = newId();

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: tillsClock() });
  s = await syncShop(app, pool);
  bar = await kitchenStation(app, s);
  managerId = await hireManager(app, s);
  await expectStatus(
    app.inject({
      method: "PUT",
      url: `/catalog/products/${beans}`,
      headers: { cookie: s.shop.managerCookie },
      payload: {
        version: null,
        brandId: s.brandId,
        kind: "retail_item",
        taxRateBp: 0,
        pricingMode: "weighed",
        name: "Cà phê hạt",
        basePrice: 32_000,
        measureUnit: "100g",
      },
    }),
    201,
  );
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const till = () => s.tillA;

/** 351 g of beans saved and printed for the bar. */
async function beansAtTheBar() {
  const weighing = line(beans, { quantity: "3.51" });
  const draft = saveDraft(till(), [weighing]);
  expect((await pushOne(app, till(), draft)).status).toBe("accepted");
  const orderId = orderIdOf(draft);
  const sent = await pushOne(
    app,
    till(),
    sentToKitchen(till(), orderId, bar, [ticketLine(weighing.lineId, "3.51", "new")]),
  );
  expect(sent.status).toBe("accepted");
  return { orderId, lineId: weighing.lineId };
}

describe("cancelling a weighing the kitchen already has", () => {
  it("takes the 351 g back with a manager's approval and records the cancel ticket in the same unit", async () => {
    const { orderId, lineId } = await beansAtTheBar();
    expect(await sentStateOf(pool, s.shop.tenantId, orderId)).toEqual([
      { id: lineId, sent: "3.510", note: null },
    ]);
    const approvalId = await approve(app, till(), managerId, voidOfSent(orderId, lineId, "3.51"));
    const voided = await pushOne(
      app,
      till(),
      withApproval(voidUnits(till(), orderId, lineId, "3.51"), approvalId),
    );
    expect(voided.status).toBe("accepted");
    const cancel = voided.snapshot?.lines.find((entry) => entry.reversesLineId === lineId);
    expect(cancel).toMatchObject({ quantity: "-3.51", sentQuantity: "0" });
    // The bar is told to stop 351 g, once.
    const cancelId = cancel?.id ?? "";
    const stop = sentToKitchen(till(), orderId, bar, [ticketLine(cancelId, "3.51", "cancel")]);
    expect((await pushOne(app, till(), stop)).status).toBe("accepted");
    expect(await sentStateOf(pool, s.shop.tenantId, orderId)).toEqual([
      { id: lineId, sent: "3.510", note: null },
      { id: cancelId, sent: "3.510", note: null },
    ]);
    expect((await ticketLinesOf(pool, s.shop.tenantId, orderId)).at(-1)).toMatchObject({
      kind: "cancel",
      line_id: cancelId,
    });
    const again = sentToKitchen(till(), orderId, bar, [ticketLine(cancelId, "3.51", "cancel")]);
    expect((await pushOne(app, till(), again)).code).toBe("SYNC_KITCHEN_NOT_OWED");
  });

  it("refuses the void of a sent weighing without the manager's approval", async () => {
    const { orderId, lineId } = await beansAtTheBar();
    const alone = await pushOne(app, till(), voidUnits(till(), orderId, lineId, "3.51"));
    expect(alone).toMatchObject({ status: "rejected", code: "DOMAIN_ORDER_VOID_NEEDS_APPROVAL" });
  });

  it("does not cover another weight than the one the manager was shown", async () => {
    const { orderId, lineId } = await beansAtTheBar();
    const approvalId = await approve(app, till(), managerId, voidOfSent(orderId, lineId, "1.5"));
    const refused = await pushOne(
      app,
      till(),
      withApproval(voidUnits(till(), orderId, lineId, "3.51"), approvalId),
    );
    expect(refused.status).toBe("rejected");
  });

  it("takes back part of the weighing when the approval names that weight", async () => {
    const { orderId, lineId } = await beansAtTheBar();
    const approvalId = await approve(app, till(), managerId, voidOfSent(orderId, lineId, "1.2"));
    const voided = await pushOne(
      app,
      till(),
      withApproval(voidUnits(till(), orderId, lineId, "1.2"), approvalId),
    );
    expect(voided.status).toBe("accepted");
    expect(voided.snapshot?.lines.find((entry) => entry.reversesLineId === lineId)).toMatchObject({
      quantity: "-1.2",
    });
  });
});
