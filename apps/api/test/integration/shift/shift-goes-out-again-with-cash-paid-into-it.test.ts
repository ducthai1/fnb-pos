import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import type { ShiftSnapshot } from "../../../src/sync/shift-wire-types";
import {
  approval,
  closeShift,
  coffeeDraft,
  freshTill,
  openedShift,
  payInShift,
  pushShift,
} from "../support/shift-commands";
import { hire } from "../support/staffed-shop";
import { command, pullAll, pushOne, tillsClock } from "../support/sync-commands";
import { type SyncShop, type Till, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");
const MANAGER_PIN = "7391";

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
let managerId: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: tillsClock() });
  s = await syncShop(app, pool);
  managerId = await hire(app, s.shop, MANAGER_PIN, s.shop.roleIds.manager);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/** The copies of `shiftId` the feed sent after `cursor`, oldest first. */
async function shiftCopies(till: Till, shiftId: string, cursor: string) {
  const { changes } = await pullAll(app, till, cursor);
  return changes
    .filter((change) => change.entity === "shift" && change.entityId === shiftId)
    .map((change) => change.snapshot as ShiftSnapshot);
}

/** A table opened in the till's first shift, still open when the second opens. */
async function tableCarriedIntoSecondShift() {
  const till = await freshTill(app, s);
  await openedShift(app, till, 500_000);
  const orderId = await coffeeDraft(app, s, till);
  expect((await pushShift(app, till, closeShift(till, 500_000))).status).toBe("accepted");
  const second = await openedShift(app, till, 500_000);
  const { cursor } = await pullAll(app, till);
  return { till, orderId, second, cursor };
}

describe("cash paid into an open shift", () => {
  it("sends the shift out again with the cash in its figures and a higher version", async () => {
    const { till, orderId, second, cursor } = await tableCarriedIntoSecondShift();
    const before = (await shiftCopies(till, second, "0")).at(-1);
    const paid = await pushOne(app, till, payInShift(till, orderId, 29_000, second));
    expect(paid.status).toBe("accepted");
    const copies = await shiftCopies(till, second, cursor);
    expect(copies).toHaveLength(1);
    expect(copies[0]?.figures).toMatchObject({ cashSales: 29_000, expectedCash: 529_000 });
    expect(copies[0]?.version).toBeGreaterThan(before?.version ?? Number.MAX_SAFE_INTEGER);
  });

  it("does not send it out for a payment that took no cash", async () => {
    const { till, orderId, second, cursor } = await tableCarriedIntoSecondShift();
    const byCard = command(till, "order.pay", {
      orderId,
      payments: [{ method: "card", amount: 29_000 }],
      expectedAmountDue: 29_000,
      shiftId: second,
    });
    expect((await pushOne(app, till, byCard)).status).toBe("accepted");
    expect(await shiftCopies(till, second, cursor)).toEqual([]);
  });
});

describe("closing a shift that took a table's cash from the previous one", () => {
  it("expects the table's cash, and takes only an approval for the server's own difference", async () => {
    const { till, orderId, second } = await tableCarriedIntoSecondShift();
    expect((await pushOne(app, till, payInShift(till, orderId, 29_000, second))).status).toBe(
      "accepted",
    );
    // The cashier pocketed the 29.000 đ and counts the float alone.
    const unapproved = await pushShift(app, till, closeShift(till, 500_000));
    expect(unapproved.code).toBe("SYNC_APPROVAL_REQUIRED");
    const forNothing = await approval(
      app,
      till,
      { key: "accept_close_difference", difference: "0" },
      managerId,
      MANAGER_PIN,
    );
    const refused = await pushShift(app, till, closeShift(till, 500_000, { approvalId: forNothing }));
    expect(refused.code).toBe("SYNC_APPROVAL_FOR_ANOTHER_ACTION");
    const forTheShortfall = await approval(
      app,
      till,
      { key: "accept_close_difference", difference: "-29000" },
      managerId,
      MANAGER_PIN,
    );
    const closed = await pushShift(
      app,
      till,
      closeShift(till, 500_000, { approvalId: forTheShortfall }),
    );
    expect(closed.status).toBe("accepted");
    expect(closed.snapshot?.close).toMatchObject({
      expectedCash: 529_000,
      difference: -29_000,
      approvalId: forTheShortfall,
    });
  });

  it("refuses an approval request for the close that names no difference", async () => {
    const { till } = await tableCarriedIntoSecondShift();
    await expect(
      approval(app, till, { key: "accept_close_difference" }, managerId, MANAGER_PIN),
    ).rejects.toThrow("approval answered 400");
  });
});
