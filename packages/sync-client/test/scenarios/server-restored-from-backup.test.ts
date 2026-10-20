import { afterEach, describe, expect, it } from "vitest";
import {
  COFFEE,
  type Cleanups,
  PEACH_TEA_AFTER_RESTORE,
  peachTeaPriceShownBy,
  raisePeachTea,
  resentAudits,
  restorableShop,
  sell,
} from "../support/restorable-shop";
import { shownOrders, syncUntilConverged } from "../support/scenario-till";
import { feedOrders, serverLedger, storedOrders } from "../support/server-truth";

const cleanups: Cleanups = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("a server restored from the backup of the night before", () => {
  it("gets back every sale a till made after the backup, and the till keeps selling", async () => {
    const { server, shop, tillOf, backUp } = await restorableShop(cleanups);
    const a = tillOf("a", shop.tillA, 31);
    const before = [await sell(a, shop, 1), await sell(a, shop, 2)];
    await a.syncUntilIdle();
    const backup = await backUp();
    const after = [await sell(a, shop, 3), await sell(a, shop, 4)];
    await a.syncUntilIdle();
    expect((await storedOrders(server, shop)).size).toBe(4);

    await backup.restoreInto(server);
    expect([...(await storedOrders(server, shop)).keys()].sort()).toEqual([...before].sort());
    await raisePeachTea(server, shop);
    const reports = await a.syncUntilIdle();

    expect(reports.find((report) => report.restore !== null)?.restore).toEqual({
      resent: 4,
      unrecoverable: 0,
    });
    expect(reports.flatMap((report) => report.rejected)).toEqual([]);
    const stored = await storedOrders(server, shop);
    expect([...stored.keys()].sort()).toEqual([...before, ...after].sort());
    for (const order of stored.values()) {
      expect(order).toMatchObject({ status: "paid", lines: 1, payments: 1, paid: COFFEE });
    }
    expect(await serverLedger(server, shop, shop.tillA)).toEqual({
      accepted: 8,
      rejected: 0,
      changeRowsWrittenTwice: 0,
    });
    expect(await resentAudits(server, shop, shop.tillA.deviceId)).toEqual(
      Array(4).fill("accepted"),
    );
    expect(await peachTeaPriceShownBy(a, shop)).toBe(PEACH_TEA_AFTER_RESTORE);
    expect(await a.client.restoreState()).toEqual({ resending: 0, unrecoverable: 0 });

    const fifth = await sell(a, shop, 5, "peachTea", PEACH_TEA_AFTER_RESTORE);
    const lastReports = await a.syncUntilIdle();
    expect(lastReports.flatMap((report) => report.rejected)).toEqual([]);
    expect((await storedOrders(server, shop)).get(fifth)).toMatchObject({
      status: "paid",
      paid: PEACH_TEA_AFTER_RESTORE,
    });
    expect(await shownOrders(a)).toEqual(await feedOrders(server, shop.tillA));
  });

  it("catches up two tills, one of them offline through the restore and selling", async () => {
    const { server, shop, tillOf, backUp } = await restorableShop(cleanups);
    const a = tillOf("a", shop.tillA, 41);
    const b = tillOf("b", shop.tillB, 43);
    await sell(a, shop, 1);
    await sell(b, shop, 1);
    await syncUntilConverged([a, b]);
    const backup = await backUp();
    await sell(a, shop, 2);
    await sell(b, shop, 2);
    await sell(b, shop, 3);
    await syncUntilConverged([a, b]);
    expect((await storedOrders(server, shop)).size).toBe(5);

    a.network.online = false;
    await backup.restoreInto(server);
    await raisePeachTea(server, shop);
    await b.syncUntilIdle();
    expect((await storedOrders(server, shop)).size).toBe(4);
    await sell(a, shop, 3, "peachTea", PEACH_TEA_AFTER_RESTORE);
    expect((await a.client.syncOnce()).failure?.kind).toBe("network");

    a.network.online = true;
    await syncUntilConverged([a, b]);
    const stored = await storedOrders(server, shop);
    expect(stored.size).toBe(6);
    expect([...stored.values()].every((order) => order.status === "paid")).toBe(true);
    expect([...stored.values()].map((order) => order.paid).sort()).toEqual(
      [...Array(5).fill(COFFEE), PEACH_TEA_AFTER_RESTORE].sort(),
    );
    expect(await serverLedger(server, shop, shop.tillA)).toMatchObject({
      accepted: 6,
      rejected: 0,
    });
    expect(await serverLedger(server, shop, shop.tillB)).toMatchObject({
      accepted: 6,
      rejected: 0,
    });
    expect(await resentAudits(server, shop, shop.tillA.deviceId)).toHaveLength(2);
    expect(await resentAudits(server, shop, shop.tillB.deviceId)).toHaveLength(4);
    for (const till of [a, b]) {
      expect(await peachTeaPriceShownBy(till, shop)).toBe(PEACH_TEA_AFTER_RESTORE);
      expect(await shownOrders(till)).toEqual(await feedOrders(server, till.till));
    }
  });
});
