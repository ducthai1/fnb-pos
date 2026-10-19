import type { SyncShop } from "@fnb/api/test-support/sync-shop";
import { newId } from "@fnb/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scratchDirectory } from "../../src/local-store/local-store-test-support";
import type { FaultPlan } from "../support/flaky-network";
import { pick, saveDraft } from "../support/order-commands";
import { PeakHour } from "../support/peak-hour-workload";
import { ScenarioServer } from "../support/scenario-server";
import { ScenarioTill, shownOrders, syncUntilConverged } from "../support/scenario-till";
import { feedOrders, serverLedger, storedOrders } from "../support/server-truth";
import { virtualClock } from "../support/virtual-clock";

const dir = scratchDirectory("peak");
let server: ScenarioServer;
let shop: SyncShop;

beforeAll(async () => ({ server, shop } = await ScenarioServer.withShop()));
afterAll(async () => {
  await server.close();
  dir.remove();
});

// Flaky, not down: every few requests one gets through, as on a busy shop's Wi-Fi.
const FAULTS: FaultPlan = {
  dropRequest: 0.05,
  dropResponse: 0.15,
  duplicate: 0.05,
  late: 0.05,
  maxFailuresInARow: 2,
};
const TICKS = 120;
const TABLES = 3;

describe("two tills at the peak hour, pushing and pulling all the time on a flaky network", () => {
  it("never show an older version, act on current data, and end equal to the server", async () => {
    const { clock } = virtualClock();
    const options = { dir: dir.path, clock, faults: FAULTS, batchSize: 5 };
    const a = new ScenarioTill(server.send, shop.tillA, { ...options, name: "a", seed: 41 });
    const b = new ScenarioTill(server.send, shop.tillB, { ...options, name: "b", seed: 51 });
    const tables = Array.from({ length: TABLES }, () => newId());
    for (const [n, tableOrder] of tables.entries()) {
      await a.client.enqueue(
        saveDraft({ id: tableOrder, deviceOrderNo: n + 1, base: null }, [
          pick(shop.menu.coffee.id, 29_000),
        ]),
      );
    }
    await syncUntilConverged([a, b]);

    const peak = new PeakHour(shop, [a, b], tables, { handoverDelay: 6 });
    await peak.run(TICKS);
    const busyPulls = [a, b].map(
      (till) => peak.passes.get(till)!.filter((pass) => pass.pending > 0 && pass.pulled > 0).length,
    );
    await syncUntilConverged([a, b]);

    // A version, once seen, never goes back.
    expect(peak.regressions).toEqual([]);
    // Every handed-over order reached the other till at its current version, so no payment
    // was refused for stale data: the rate of commands refused for a starved pull is 0.
    expect(peak.stale).toEqual([]);
    expect(await a.client.rejectedCommands()).toEqual([]);
    expect(await b.client.rejectedCommands()).toEqual([]);
    expect(peak.paid.length + peak.stillArriving).toBe(peak.handedOver);
    // Both tills and the server hold the same orders, each command applied once.
    const feed = await feedOrders(server, shop.tillA);
    expect(await shownOrders(a)).toEqual(feed);
    expect(await shownOrders(b)).toEqual(feed);
    const stored = await storedOrders(server, shop);
    expect(stored.size).toBe(feed.size);
    expect(peak.paid.map((orderId) => stored.get(orderId)?.status)).toEqual(
      peak.paid.map(() => "paid"),
    );
    for (const [orderId, order] of stored) {
      const fed = feed.get(orderId) as { version: number; status: string };
      expect({ orderId, version: order.version, status: order.status }).toEqual({
        orderId,
        version: fed.version,
        status: fed.status,
      });
      expect(order.payments).toBe(order.status === "paid" ? 1 : 0);
    }
    for (const till of [shop.tillA, shop.tillB]) {
      expect(await serverLedger(server, shop, till)).toMatchObject({
        rejected: 0,
        changeRowsWrittenTwice: 0,
      });
    }
    // And the run was the hard case: faults happened, orders went across, and both tills
    // pulled while their own commands were still waiting.
    expect(peak.handedOver).toBeGreaterThan(TICKS / 2);
    expect(Math.min(...busyPulls)).toBeGreaterThan(TICKS / 4);
    for (const till of [a, b]) {
      expect(till.network.stats.droppedResponses).toBeGreaterThan(5);
      expect(till.network.stats.late + till.network.stats.duplicated).toBeGreaterThan(5);
    }
    await a.close();
    await b.close();
  });
});
