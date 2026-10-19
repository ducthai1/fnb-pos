import type { SyncShop } from "@fnb/api/test-support/sync-shop";
import { newId } from "@fnb/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scratchDirectory } from "../../src/local-store/local-store-test-support";
import { pick, saveDraft } from "../support/order-commands";
import { ScenarioServer } from "../support/scenario-server";
import { ScenarioTill, shownOrders } from "../support/scenario-till";
import { feedOrders } from "../support/server-truth";
import { virtualClock } from "../support/virtual-clock";

const dir = scratchDirectory("pull-resumes");
let server: ScenarioServer;
let shop: SyncShop;

beforeAll(async () => ({ server, shop } = await ScenarioServer.withShop()));
afterAll(async () => {
  await server.close();
  dir.remove();
});

const pulledCursors = (till: ScenarioTill) =>
  till.network.tried
    .filter((request) => request.startsWith("GET /sync/changes"))
    .map((request) => new URLSearchParams(request.split("?")[1]).get("cursor"));

describe("a till restarted halfway through pulling", () => {
  it("goes on from its stored cursor and receives every change exactly once", async () => {
    const { clock } = virtualClock();
    const seller = new ScenarioTill(server.send, shop.tillA, {
      dir: dir.path,
      name: "a",
      seed: 1,
      clock,
    });
    for (let n = 1; n <= 12; n += 1) {
      await seller.client.enqueue(
        saveDraft({ id: newId(), deviceOrderNo: n, base: null }, [
          pick(shop.menu.coffee.id, 29_000),
        ]),
      );
    }
    await seller.syncUntilIdle();

    const options = { dir: dir.path, name: "b", seed: 2, clock, pullLimit: 5, maxPullPages: 1 };
    const before = new ScenarioTill(server.send, shop.tillB, options);
    expect((await before.client.syncOnce()).pulled).toBe(5);
    const stopped = await before.store.cursor();
    await before.close();

    const after = new ScenarioTill(server.send, shop.tillB, options);
    const reports = await after.syncUntilIdle();
    expect(pulledCursors(after)[0]).toBe(stopped);
    expect(pulledCursors(after)).not.toContain("0");
    expect(reports.reduce((sum, report) => sum + report.pulled, 0)).toBe(7);
    expect(await shownOrders(after)).toEqual(await feedOrders(server, shop.tillB));
    expect((await shownOrders(after)).size).toBe(12);
    await after.close();
    await seller.close();
  });
});
