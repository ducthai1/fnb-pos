import {
  type ProvisionedScratchDatabase,
  provisionScratchDatabase,
} from "@fnb/api/test-support/provisioned-scratch-database";
import type { SyncShop } from "@fnb/api/test-support/sync-shop";
import { newId, withTenant } from "@fnb/db";
import { afterEach, describe, expect, inject, it } from "vitest";
import { scratchDirectory } from "../../src/local-store/local-store-test-support";
import { DatabaseBackup } from "../support/database-backup";
import { amountDueOf } from "../support/order-amount-due";
import { orderOf, pay, pick, saveDraft } from "../support/order-commands";
import { ScenarioServer } from "../support/scenario-server";
import { ScenarioTill, shownOrders, syncUntilConverged } from "../support/scenario-till";
import { feedOrders, serverLedger, storedOrders } from "../support/server-truth";
import { virtualClock } from "../support/virtual-clock";

const info = inject("testPostgres");
const COFFEE = 29_000;
const PEACH_TEA_AFTER_RESTORE = 38_000;
const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** A shop on a database of its own, so it can be backed up and restored whole. */
async function restorableShop() {
  const database: ProvisionedScratchDatabase = await provisionScratchDatabase(info);
  cleanups.push(() => database.drop());
  const { server, shop } = await ScenarioServer.withShop(database.appUrl);
  cleanups.push(() => server.close());
  const dir = scratchDirectory("server-restored");
  cleanups.push(async () => dir.remove());
  const time = virtualClock();
  const tillOf = (name: string, till: SyncShop["tillA"], seed: number) => {
    const options = { dir: dir.path, name, seed, clock: time.clock };
    const scenarioTill = new ScenarioTill(server.send, till, options);
    cleanups.push(() => scenarioTill.close());
    return scenarioTill;
  };
  const backUp = async () => {
    const backup = await DatabaseBackup.take(info, database, server);
    cleanups.push(() => backup.drop());
    return backup;
  };
  return { server, shop, tillOf, backUp };
}

/** One coffee, saved and paid in cash at what the till asks for. */
async function sellCoffee(till: ScenarioTill, shop: SyncShop, deviceOrderNo: number) {
  const id = newId();
  const item = pick(shop.menu.coffee.id, COFFEE);
  await till.client.enqueue(saveDraft({ id, deviceOrderNo, base: null }, [item]));
  const shown = orderOf(await till.client.snapshot("order", id))!;
  await till.client.enqueue(pay(shown, amountDueOf(shown)));
  return id;
}

/** The backoffice raises the base price of peach tea, as the manager would. */
async function raisePeachTea(server: ScenarioServer, shop: SyncShop) {
  const { id, sizeM, sizeL } = shop.menu.peachTea;
  const version = await withTenant(server.pool, shop.shop.tenantId, async (client) => {
    const { rows } = await client.query("SELECT version FROM product WHERE id = $1", [id]);
    return rows[0].version as number;
  });
  const response = await server.backoffice({
    method: "PUT",
    url: `/catalog/products/${id}`,
    cookie: shop.shop.managerCookie,
    payload: {
      version,
      brandId: shop.brandId,
      pricingMode: "fixed",
      taxRateBp: 800,
      kind: "prepared_drink",
      name: "Trà đào",
      basePrice: PEACH_TEA_AFTER_RESTORE,
      variants: [
        { id: sizeM, name: "M" },
        { id: sizeL, name: "L", price: 45_000 },
      ],
    },
  });
  expect(response.status).toBe(200);
}

const peachTeaPriceShownBy = async (till: ScenarioTill, shop: SyncShop) =>
  (await till.client.snapshot("catalog_product", shop.menu.peachTea.id))?.snapshot.basePrice;

async function sellPeachTea(till: ScenarioTill, shop: SyncShop, deviceOrderNo: number) {
  const id = newId();
  const item = pick(shop.menu.peachTea.id, PEACH_TEA_AFTER_RESTORE, {
    variantId: shop.menu.peachTea.sizeM,
  });
  await till.client.enqueue(saveDraft({ id, deviceOrderNo, base: null }, [item]));
  const shown = orderOf(await till.client.snapshot("order", id))!;
  await till.client.enqueue(pay(shown, amountDueOf(shown)));
  return id;
}

const resentAudits = (server: ScenarioServer, shop: SyncShop, deviceId: string) =>
  withTenant(server.pool, shop.shop.tenantId, async (client) => {
    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM audit_log WHERE action = " +
        "'sync.command_resent_after_restore' AND entity_id = $1",
      [deviceId],
    );
    return rows[0].n as number;
  });

describe("a server restored from the backup of the night before", () => {
  it("gets back every sale a till made after the backup, and the till keeps selling", async () => {
    const { server, shop, tillOf, backUp } = await restorableShop();
    const a = tillOf("a", shop.tillA, 31);
    const before = [await sellCoffee(a, shop, 1), await sellCoffee(a, shop, 2)];
    await a.syncUntilIdle();
    const backup = await backUp();
    const after = [await sellCoffee(a, shop, 3), await sellCoffee(a, shop, 4)];
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
    expect(await resentAudits(server, shop, shop.tillA.deviceId)).toBe(4);
    expect(await peachTeaPriceShownBy(a, shop)).toBe(PEACH_TEA_AFTER_RESTORE);
    expect(await a.client.restoreState()).toEqual({ resending: 0, unrecoverable: 0 });

    const fifth = await sellPeachTea(a, shop, 5);
    const lastReports = await a.syncUntilIdle();
    expect(lastReports.flatMap((report) => report.rejected)).toEqual([]);
    expect((await storedOrders(server, shop)).get(fifth)).toMatchObject({
      status: "paid",
      paid: PEACH_TEA_AFTER_RESTORE,
    });
    expect(await shownOrders(a)).toEqual(await feedOrders(server, shop.tillA));
  });

  it("catches up two tills, one of them offline through the restore and selling", async () => {
    const { server, shop, tillOf, backUp } = await restorableShop();
    const a = tillOf("a", shop.tillA, 41);
    const b = tillOf("b", shop.tillB, 43);
    await sellCoffee(a, shop, 1);
    await sellCoffee(b, shop, 1);
    await syncUntilConverged([a, b]);
    const backup = await backUp();
    await sellCoffee(a, shop, 2);
    await sellCoffee(b, shop, 2);
    await sellCoffee(b, shop, 3);
    await syncUntilConverged([a, b]);
    expect((await storedOrders(server, shop)).size).toBe(5);

    a.network.online = false;
    await backup.restoreInto(server);
    await raisePeachTea(server, shop);
    await b.syncUntilIdle();
    expect((await storedOrders(server, shop)).size).toBe(4);
    await sellPeachTea(a, shop, 3);
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
    expect(await resentAudits(server, shop, shop.tillA.deviceId)).toBe(2);
    expect(await resentAudits(server, shop, shop.tillB.deviceId)).toBe(4);
    for (const till of [a, b]) {
      expect(await peachTeaPriceShownBy(till, shop)).toBe(PEACH_TEA_AFTER_RESTORE);
      expect(await shownOrders(till)).toEqual(await feedOrders(server, till.till));
    }
  });
});
