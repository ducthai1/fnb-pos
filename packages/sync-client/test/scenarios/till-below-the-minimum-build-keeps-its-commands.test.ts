import type { SyncShop } from "@fnb/api/test-support/sync-shop";
import { newId } from "@fnb/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scratchDirectory } from "../../src/local-store/local-store-test-support";
import { orderOf, pick, saveDraft } from "../support/order-commands";
import { ScenarioServer } from "../support/scenario-server";
import { ScenarioTill } from "../support/scenario-till";
import { serverLedger } from "../support/server-truth";
import { virtualClock } from "../support/virtual-clock";

const dir = scratchDirectory("minimum-build");
let server: ScenarioServer;
let shop: SyncShop;

beforeAll(async () => ({ server, shop } = await ScenarioServer.withShop()));
afterAll(async () => {
  await server.close();
  dir.remove();
});

const tillAt = (posBuild: number) =>
  new ScenarioTill(server.send, shop.tillA, {
    dir: dir.path,
    name: "till",
    seed: 3,
    clock: virtualClock().clock,
    posBuild,
  });

describe("a till whose build is below the server's minimum", () => {
  it("keeps what it recorded, apart from the refused list, and sends it once updated", async () => {
    await server.requirePosBuild(2_000);
    const old = tillAt(1_000);
    const orderId = newId();
    await old.client.enqueue(
      saveDraft({ id: orderId, deviceOrderNo: 1, base: null }, [pick(shop.menu.coffee.id, 29_000)]),
    );

    const report = await old.client.syncOnce();
    expect(report.failure).toMatchObject({ kind: "http", status: 426, code: "API_POS_RELEASE_TOO_OLD" });
    expect(await old.client.pendingCount()).toBe(1);
    expect(await old.client.rejectedCommands()).toEqual([]);
    expect(await serverLedger(server, shop, shop.tillA)).toMatchObject({ accepted: 0, rejected: 0 });
    await old.close();

    // The till reloads into the newer build; its database is the one it had.
    const updated = tillAt(2_000);
    await updated.syncUntilIdle();
    expect(await updated.client.pendingCount()).toBe(0);
    expect(orderOf(await updated.client.snapshot("order", orderId))).toBeTruthy();
    expect(await serverLedger(server, shop, shop.tillA)).toMatchObject({ accepted: 1, rejected: 0 });
    await updated.close();
  });
});
