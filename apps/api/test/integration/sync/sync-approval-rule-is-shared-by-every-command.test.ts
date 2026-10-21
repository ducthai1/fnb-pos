import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { expectStatus } from "../support/catalog-shop";
import { cashMove, freshTill, openedShift, pushShift } from "../support/shift-commands";
import { approve, hireManager, justNow, signInAs } from "../support/sync-approvals";
import { line, pushOne, saveDraft, tillsClock } from "../support/sync-commands";
import { type SyncShop, type Till, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
let managerId: string;
const cake = newId();

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: tillsClock() });
  s = await syncShop(app, pool);
  managerId = await hireManager(app, s);
  await signInAs(app, s, s.tillB, "waiter");
  await expectStatus(
    app.inject({
      method: "PUT",
      url: `/catalog/products/${cake}`,
      headers: { cookie: s.shop.managerCookie },
      payload: {
        version: null,
        brandId: s.brandId,
        kind: "retail_item",
        name: "Bánh nhà làm",
        pricingMode: "open_price",
        basePrice: null,
        taxRateBp: 800,
      },
    }),
    201,
  );
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/** A waiter's draft typing a price, with the approval named where `where` says. */
function typedPrice(where: { payload?: string; envelope?: string }) {
  const sent = saveDraft(s.tillB, [line(cake, { enteredPrice: 42_000 })]);
  return {
    ...sent,
    createdAt: justNow(),
    payload: { ...(sent.payload as object), approvalId: where.payload },
    ...(where.envelope === undefined ? {} : { approvalId: where.envelope }),
  };
}

const openPrice = { key: "open_price" };

/** A till whose cashier has a shift open and has already moved 450.000 đ out alone. */
async function tillNearTheCashCap(): Promise<{ till: Till; shiftId: string }> {
  const till = await freshTill(app, s);
  const shiftId = await openedShift(app, till, 2_000_000);
  expect((await pushShift(app, till, cashMove(till, "out", 450_000))).status).toBe("accepted");
  return { till, shiftId };
}

/** An approval of a cash move bringing the shift's total to `amount`. */
const cashTotal = (shiftId: string, amount: string) => ({
  key: "cash_move",
  amount,
  subject: { shiftId },
});

const usesOf = (approvalId: string) =>
  withTenant(pool, s.shop.tenantId, async (client) => {
    const { rows } = await client.query(
      "SELECT payload->>'commandType' AS type FROM approval_use WHERE approval_id = $1",
      [approvalId],
    );
    return rows.map((row) => row.type as string);
  });

describe("the one approval rule of order and shift commands", () => {
  it("takes an approval named on the envelope of an order command", async () => {
    const approvalId = await approve(app, s.tillB, managerId, openPrice);
    const result = await pushOne(app, s.tillB, typedPrice({ envelope: approvalId }));
    expect(result.status).toBe("accepted");
    expect(await usesOf(approvalId)).toEqual(["order.save_draft"]);
  });

  it("takes an approval named on the envelope of a shift command, and spends it the same way", async () => {
    const { till, shiftId } = await tillNearTheCashCap();
    const approvalId = await approve(app, till, managerId, cashTotal(shiftId, "550000"));
    const sent = { ...cashMove(till, "out", 100_000), createdAt: justNow(), approvalId };
    expect((await pushShift(app, till, sent)).status).toBe("accepted");
    expect(await usesOf(approvalId)).toEqual(["shift.cash_move"]);
  });

  it("refuses a command whose payload and envelope name two different approvals", async () => {
    const inPayload = await approve(app, s.tillB, managerId, openPrice);
    const onEnvelope = await approve(app, s.tillB, managerId, openPrice);
    const order = await pushOne(
      app,
      s.tillB,
      typedPrice({ payload: inPayload, envelope: onEnvelope }),
    );
    expect(order).toMatchObject({ status: "rejected", code: "SYNC_INVALID_PAYLOAD" });
    const { till, shiftId } = await tillNearTheCashCap();
    const cash = await approve(app, till, managerId, cashTotal(shiftId, "550000"));
    const other = await approve(app, till, managerId, cashTotal(shiftId, "550000"));
    const sent = { ...cashMove(till, "out", 100_000, { approvalId: cash }), approvalId: other };
    expect((await pushShift(app, till, sent)).code).toBe("SYNC_INVALID_PAYLOAD");
    expect([...(await usesOf(inPayload)), ...(await usesOf(cash))]).toEqual([]);
  });

  it("leaves unspent an approval named by a command the staff member may do alone", async () => {
    const till = await freshTill(app, s);
    const shiftId = await openedShift(app, till, 2_000_000);
    const approvalId = await approve(app, till, managerId, cashTotal(shiftId, "100000"));
    const sent = cashMove(till, "out", 100_000, { approvalId });
    expect((await pushShift(app, till, sent)).status).toBe("accepted");
    // Moved alone under the cap, so the approval was never spent and stays for its own move.
    expect(await usesOf(approvalId)).toEqual([]);
  });
});
