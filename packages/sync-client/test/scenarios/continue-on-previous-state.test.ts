import type { SyncShop, Till } from "@fnb/api/test-support/sync-shop";
import { newId } from "@fnb/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scratchDirectory } from "../../src/local-store/local-store-test-support";
import { amountDueOf } from "../support/order-amount-due";
import { itemsOf, orderOf, pay, pick, saveDraft } from "../support/order-commands";
import { ScenarioServer } from "../support/scenario-server";
import { ScenarioTill, shownOrders, syncUntilConverged } from "../support/scenario-till";
import { feedOrders, serverLedger, storedOrders } from "../support/server-truth";
import { virtualClock } from "../support/virtual-clock";

// Two runs over one shop, the till databases and the server database kept in between: the
// second run reopens the same files on a restarted server, the way tills resume after a
// night off. Bugs of a second run only show on data the first run left behind.
const dir = scratchDirectory("second-run");
const time = virtualClock();
const FAULTS = {
  dropRequest: 0.1,
  dropResponse: 0.15,
  duplicate: 0.1,
  late: 0.1,
  maxFailuresInARow: 3,
};
let server: ScenarioServer;
let shop: SyncShop;
const lastSeq = new Map<string, number>();
let firstRunCursor = "0";
let firstRunOrders = new Map<string, unknown>();
const ordersOf = new Map<string, string[]>();

beforeAll(async () => ({ server, shop } = await ScenarioServer.withShop()));
afterAll(async () => {
  await server.close();
  dir.remove();
});

const open = (till: Till, name: string, seed: number) =>
  new ScenarioTill(server.send, till, {
    dir: dir.path,
    name,
    seed,
    clock: time.clock,
    faults: FAULTS,
    batchSize: 4,
  });

async function sell(till: ScenarioTill, name: string, count: number, firstNo: number) {
  for (let n = firstNo; n < firstNo + count; n += 1) {
    const orderId = newId();
    ordersOf.set(name, [...(ordersOf.get(name) ?? []), orderId]);
    const sent = await till.client.enqueue(
      saveDraft({ id: orderId, deviceOrderNo: n, base: null }, [pick(shop.menu.coffee.id, 29_000)]),
    );
    lastSeq.set(name, sent.deviceSeq);
  }
}

describe("syncing again on the data of an earlier run", () => {
  it("first run: two tills sell, pay some orders and converge", async () => {
    const [a, b] = [open(shop.tillA, "a", 21), open(shop.tillB, "b", 31)];
    await sell(a, "a", 6, 1);
    await sell(b, "b", 4, 1);
    for (const orderId of ordersOf.get("a")!.slice(0, 3)) {
      const shown = orderOf(await a.client.snapshot("order", orderId))!;
      lastSeq.set("a", (await a.client.enqueue(pay(shown, amountDueOf(shown)))).deviceSeq);
    }
    await syncUntilConverged([a, b]);
    firstRunCursor = await b.store.cursor();
    firstRunOrders = await shownOrders(b);
    expect(firstRunOrders.size).toBe(10);
    expect(await shownOrders(a)).toEqual(firstRunOrders);
    await a.close();
    await b.close();
  });

  it("second run: the same files on a restarted server go on where they stopped", async () => {
    await server.restart();
    const [a, b] = [open(shop.tillA, "a", 22), open(shop.tillB, "b", 32)];
    expect(await b.store.cursor()).toBe(firstRunCursor);
    expect(await shownOrders(b)).toEqual(firstRunOrders);
    // Till A adds a drink to two of B's open orders from the first run, and pays one of them.
    const tea = () => pick(shop.menu.peachTea.id, 45_000, { variantId: shop.menu.peachTea.sizeL });
    for (const orderId of ordersOf.get("b")!.slice(0, 2)) {
      const base = orderOf(await a.client.snapshot("order", orderId))!;
      const sent = await a.client.enqueue(
        saveDraft({ id: orderId, deviceOrderNo: base.deviceOrderNo, base }, [
          ...itemsOf(base),
          tea(),
        ]),
      );
      expect(sent.deviceSeq).toBe(lastSeq.get("a")! + 1);
      lastSeq.set("a", sent.deviceSeq);
    }
    const edited = orderOf(await a.client.snapshot("order", ordersOf.get("b")![0]!))!;
    await a.client.enqueue(pay(edited, amountDueOf(edited)));
    await sell(b, "b", 3, 5);
    await syncUntilConverged([a, b]);

    const pulls = b.network.tried.filter((request) => request.startsWith("GET"));
    expect(pulls[0]).toContain(`cursor=${firstRunCursor}&`);
    expect(BigInt(await b.store.cursor())).toBeGreaterThan(BigInt(firstRunCursor));
    const feed = await feedOrders(server, shop.tillA);
    expect(await shownOrders(a)).toEqual(feed);
    expect(await shownOrders(b)).toEqual(feed);
    const stored = await storedOrders(server, shop);
    expect(stored.size).toBe(13);
    expect(stored.get(ordersOf.get("b")![0]!)).toMatchObject({
      status: "paid",
      lines: 2,
      paid: 74_000,
    });
    expect(stored.get(ordersOf.get("b")![1]!)).toMatchObject({ status: "draft", lines: 2 });
    expect([...stored.values()].filter((order) => order.status === "paid")).toHaveLength(4);
    for (const [till, scenario] of [
      [shop.tillA, a],
      [shop.tillB, b],
    ] as const) {
      expect(await scenario.client.rejectedCommands()).toEqual([]);
      expect(await serverLedger(server, shop, till)).toMatchObject({
        rejected: 0,
        changeRowsWrittenTwice: 0,
      });
    }
    await a.close();
    await b.close();
  });
});
