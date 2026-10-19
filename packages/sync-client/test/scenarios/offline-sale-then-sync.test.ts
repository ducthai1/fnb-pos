import type { SyncShop } from "@fnb/api/test-support/sync-shop";
import { newId } from "@fnb/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scratchDirectory } from "../../src/local-store/local-store-test-support";
import { amountDueOf } from "../support/order-amount-due";
import { orderOf, pay, pick, saveDraft } from "../support/order-commands";
import { ScenarioServer } from "../support/scenario-server";
import { ScenarioTill, shownOrders } from "../support/scenario-till";
import { feedOrders, serverLedger, storedOrders } from "../support/server-truth";
import { virtualClock } from "../support/virtual-clock";

// On a real disk under the package (see scratchDirectory): the till's writes fsync.
const dir = scratchDirectory("offline-sale");
let server: ScenarioServer;
let shop: SyncShop;

beforeAll(async () => ({ server, shop } = await ScenarioServer.withShop()));
afterAll(async () => {
  await server.close();
  dir.remove();
});

const ORDERS = 2_000;
const PAID_EVERY = 4;

describe("a till selling offline for a whole shift", () => {
  it("syncs 2,000 orders once the network is back: none lost, none applied twice", async () => {
    const time = virtualClock();
    const till = new ScenarioTill(server.send, shop.tillA, {
      dir: dir.path,
      name: "a",
      seed: 11,
      clock: time.clock,
      batchSize: 100,
    });
    till.network.online = false;
    const prices = [
      pick(shop.menu.coffee.id, 29_000),
      pick(shop.menu.peachTea.id, 35_000, { variantId: shop.menu.peachTea.sizeM }),
    ];
    for (let n = 1; n <= ORDERS; n += 1) {
      const orderId = newId();
      const item = { ...prices[n % 2]!, lineId: newId() };
      await till.client.enqueue(saveDraft({ id: orderId, deviceOrderNo: n, base: null }, [item]));
      if (n % PAID_EVERY === 0) {
        const shown = orderOf(await till.client.snapshot("order", orderId))!;
        await till.client.enqueue(pay(shown, amountDueOf(shown)));
      }
      // The till keeps trying while the cable is out; every attempt fails and backs off.
      if (n % 500 === 0) expect((await till.client.syncOnce()).failure?.kind).toBe("network");
    }
    const commands = ORDERS + ORDERS / PAID_EVERY;
    expect(await till.client.pendingCount()).toBe(commands);
    expect(time.waitedMs()).toBeGreaterThan(0);

    till.network.online = true;
    const reports = await till.syncUntilIdle();
    expect(reports.flatMap((report) => report.accepted)).toHaveLength(commands);
    expect(reports.flatMap((report) => report.rejected)).toEqual([]);

    const stored = await storedOrders(server, shop);
    expect(stored.size).toBe(ORDERS);
    const paid = [...stored.values()].filter((order) => order.status === "paid");
    expect(paid).toHaveLength(ORDERS / PAID_EVERY);
    expect(paid.every((order) => order.payments === 1)).toBe(true);
    expect([...stored.values()].every((order) => order.lines === 1)).toBe(true);
    expect(await serverLedger(server, shop, shop.tillA)).toEqual({
      accepted: commands,
      rejected: 0,
      changeRowsWrittenTwice: 0,
    });
    expect(await shownOrders(till)).toEqual(await feedOrders(server, shop.tillA));
    await till.close();
  });
});
