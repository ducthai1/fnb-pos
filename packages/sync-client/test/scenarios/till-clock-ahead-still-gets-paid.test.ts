import type { SyncShop } from "@fnb/api/test-support/sync-shop";
import { newId, withTenant } from "@fnb/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scratchDirectory } from "../../src/local-store/local-store-test-support";
import { amountDueOf } from "../support/order-amount-due";
import { orderOf, pay, pick, saveDraft } from "../support/order-commands";
import { ScenarioServer } from "../support/scenario-server";
import { ScenarioTill } from "../support/scenario-till";
import { virtualClock } from "../support/virtual-clock";

const dir = scratchDirectory("till-clock-ahead");
let server: ScenarioServer;
let shop: SyncShop;

beforeAll(async () => ({ server, shop } = await ScenarioServer.withShop()));
afterAll(async () => {
  await server.close();
  dir.remove();
});

const MINUTE = 60_000;

/** A till on a PC whose clock reads five minutes past the server's (the API's real clock). */
function fastTill(which: "tillA" | "tillB", seed: number) {
  const time = virtualClock(Date.now() + 5 * MINUTE);
  const till = new ScenarioTill(server.send, shop[which], {
    dir: dir.path,
    name: which,
    seed,
    clock: time.clock,
  });
  return { till, tillsReading: () => new Date(time.clock.now()).toISOString() };
}

/** A coffee sold and paid in cash, both dated by the till's own clock. */
async function sellAndPay(till: ScenarioTill, tillsReading: () => string, deviceOrderNo: number) {
  const orderId = newId();
  const item = pick(shop.menu.coffee.id, 29_000);
  await till.client.enqueue(
    saveDraft({ id: orderId, deviceOrderNo, base: null }, [item], { createdAt: tillsReading() }),
  );
  const shown = orderOf(await till.client.snapshot("order", orderId))!;
  await till.client.enqueue(pay(shown, amountDueOf(shown), { createdAt: tillsReading() }));
  return orderId;
}

const paidOrder = async (orderId: string) => {
  const { rows } = await withTenant(server.pool, shop.shop.tenantId, (client) =>
    client.query<{ status: string; paid_at: Date }>(
      "SELECT status, paid_at FROM sales_order WHERE id = $1",
      [orderId],
    ),
  );
  return rows[0];
};

describe("a till whose clock runs five minutes fast", () => {
  it("has a sale it took cash for taken, paid at the server's time, before it ever synced", async () => {
    const { till, tillsReading } = fastTill("tillA", 41);
    const orderId = await sellAndPay(till, tillsReading, 1);
    const before = Date.now();
    const reports = await till.syncUntilIdle();
    const after = Date.now();
    // The server sent the sale back once for its date; the till dated it again and resent.
    expect(reports.reduce((sum, report) => sum + report.retried, 0)).toBeGreaterThan(0);
    expect(reports.flatMap((report) => report.accepted)).toHaveLength(2);
    expect(reports.flatMap((report) => report.rejected)).toEqual([]);
    expect(await till.client.rejectedCommands()).toEqual([]);
    const order = await paidOrder(orderId);
    expect(order?.status).toBe("paid");
    const paidAt = order?.paid_at.getTime() ?? Number.NaN;
    expect(paidAt).toBeGreaterThanOrEqual(before - 1_000);
    expect(paidAt).toBeLessThanOrEqual(after + 1_000);
    expect(Math.round((await till.client.clockOffset())! / MINUTE)).toBe(-5);
    await till.close();
  });

  it("once it has heard the server's clock, dates the next sale right and is never sent back", async () => {
    const { till, tillsReading } = fastTill("tillB", 43);
    await till.syncUntilIdle();
    const orderId = await sellAndPay(till, tillsReading, 2);
    const before = Date.now();
    const reports = await till.syncUntilIdle();
    expect(reports.reduce((sum, report) => sum + report.retried, 0)).toBe(0);
    expect(reports.flatMap((report) => report.accepted)).toHaveLength(2);
    const paidAt = (await paidOrder(orderId))?.paid_at.getTime() ?? Number.NaN;
    expect(Math.abs(paidAt - before)).toBeLessThan(MINUTE);
    await till.close();
  });
});
