import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { kitchenStation, sentToKitchen, ticketLine } from "../support/kitchen-commands";
import { approve, hireManager } from "../support/sync-approvals";
import { line, orderIdOf, pushOne, saveDraft } from "../support/sync-commands";
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
  app = buildApp({ pool });
  s = await syncShop(app, pool);
  bar = await kitchenStation(app, s);
  managerId = await hireManager(app, s);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const till = () => s.tillA;

/** Three coffees on a draft, `printed` of them reported printed for the bar. */
async function coffeesAtTheBar(printed: string) {
  const coffee = line(s.menu.coffee.id, { quantity: "3" });
  const draft = saveDraft(till(), [coffee]);
  expect((await pushOne(app, till(), draft)).status).toBe("accepted");
  const orderId = orderIdOf(draft);
  const ticket = sentToKitchen(till(), orderId, bar, [ticketLine(coffee.lineId, printed)]);
  expect((await pushOne(app, till(), ticket)).status).toBe("accepted");
  return { orderId, coffee };
}

const voidRecordOf = (orderId: string) =>
  withTenant(pool, s.shop.tenantId, async (client) => {
    const { rows } = await client.query(
      "SELECT from_unsent::text AS unsent, from_sent::text AS sent FROM line_void_record " +
        "WHERE order_id = $1",
      [orderId],
    );
    return rows;
  });

describe("what a kitchen ticket recorded, as voids and cancels read it", () => {
  it("lets a cashier void the units the bar never got alone", async () => {
    const { orderId, coffee } = await coffeesAtTheBar("2");
    const voided = await pushOne(app, till(), voidUnits(till(), orderId, coffee.lineId, "1"));
    expect(voided.status).toBe("accepted");
    expect(await voidRecordOf(orderId)).toEqual([{ unsent: "1.000", sent: "0.000" }]);
  });

  it("asks for an approver for units the bar got, and voids the unsent ones first", async () => {
    const { orderId, coffee } = await coffeesAtTheBar("2");
    const alone = await pushOne(app, till(), voidUnits(till(), orderId, coffee.lineId, "2"));
    expect(alone.code).toBe("DOMAIN_ORDER_VOID_NEEDS_APPROVAL");
    const approvalId = await approve(app, till(), managerId, { key: "void_after_sent" });
    const approved = withApproval(voidUnits(till(), orderId, coffee.lineId, "2"), approvalId);
    expect((await pushOne(app, till(), approved)).status).toBe("accepted");
    expect(await voidRecordOf(orderId)).toEqual([{ unsent: "1.000", sent: "1.000" }]);
  });

  it("refuses to cancel an order while the bar still has units of it", async () => {
    const { orderId } = await coffeesAtTheBar("1");
    const refused = await pushOne(app, till(), cancel(till(), orderId));
    expect(refused.code).toBe("SYNC_ORDER_HAS_SENT_ITEMS");
  });
});
