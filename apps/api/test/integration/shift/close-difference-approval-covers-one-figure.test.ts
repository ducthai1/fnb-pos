import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
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
import { pushOne, tillsClock } from "../support/sync-commands";
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

const acceptDifference = (till: Till, difference: number) =>
  approval(
    app,
    till,
    { key: "accept_close_difference", difference: String(difference) },
    managerId,
    MANAGER_PIN,
  );

/** A till whose shift opened on a 500.000 đ float and sold one coffee (29.000 đ) in cash. */
async function tillWithSale() {
  const till = await freshTill(app, s);
  await openedShift(app, till, 500_000);
  const orderId = await coffeeDraft(app, s, till);
  expect((await pushOne(app, till, payInShift(till, orderId, 29_000))).status).toBe("accepted");
  return till;
}

describe("an approval of a close difference", () => {
  // The manager agreed to one figure: a shortfall the till did not show is not covered.
  it.each([
    ["no difference at all", 0],
    ["a smaller shortfall", -9_000],
    ["the same amount over", 20_000],
  ])("is refused when it was given for %s", async (_label, approved) => {
    const till = await tillWithSale();
    const other = await acceptDifference(till, approved);
    const refused = await pushShift(app, till, closeShift(till, 509_000, { approvalId: other }));
    expect(refused.code).toBe("SYNC_APPROVAL_FOR_ANOTHER_ACTION");
    // Refused, it is not spent: the same close with the right figure goes through after.
    const right = await acceptDifference(till, -20_000);
    const closed = await pushShift(app, till, closeShift(till, 509_000, { approvalId: right }));
    expect(closed.status).toBe("accepted");
  });
});
