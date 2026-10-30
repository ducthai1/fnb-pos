import type { SyncShop } from "@fnb/api/test-support/sync-shop";
import { newId } from "@fnb/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scratchDirectory } from "../../src/local-store/local-store-test-support";
import { amountDueOf } from "../support/order-amount-due";
import { itemsOf, orderOf, pay, pick, saveDraft } from "../support/order-commands";
import { ScenarioServer } from "../support/scenario-server";
import { ScenarioTill, syncUntilConverged } from "../support/scenario-till";
import { storedOrders } from "../support/server-truth";
import { virtualClock } from "../support/virtual-clock";

const dir = scratchDirectory("draft-edited-offline-while-paid-elsewhere");
let server: ScenarioServer;
let shop: SyncShop;

beforeAll(async () => ({ server, shop } = await ScenarioServer.withShop()));
afterAll(async () => {
  await server.close();
  dir.remove();
});

describe("a till that adds to a draft offline while another till takes the payment", () => {
  it("does not lose the addition quietly: the refusal stays on its list and the order is as paid", async () => {
    const { clock } = virtualClock();
    const a = new ScenarioTill(server.send, shop.tillA, {
      dir: dir.path,
      name: "a",
      seed: 61,
      clock,
    });
    const b = new ScenarioTill(server.send, shop.tillB, {
      dir: dir.path,
      name: "b",
      seed: 62,
      clock,
    });
    const orderId = newId();
    await a.client.enqueue(
      saveDraft({ id: orderId, deviceOrderNo: 1, base: null, expectedVersion: 0 }, [
        pick(shop.menu.coffee.id, 29_000, { note: "ít đá <b>&</b> 🧋" }),
      ]),
    );
    await syncUntilConverged([a, b]);

    // A loses the network and adds a tea on its own copy of the order.
    a.network.online = false;
    const base = orderOf(await a.client.snapshot("order", orderId))!;
    const added = pick(shop.menu.peachTea.id, 35_000, { variantId: shop.menu.peachTea.sizeM });
    await a.client.enqueue(
      saveDraft({ id: orderId, deviceOrderNo: 1, base, expectedVersion: base.version }, [
        ...itemsOf(base),
        added,
      ]),
    );
    // Meanwhile B, which knows the order as it was, takes the money for it.
    const seenByB = orderOf(await b.client.snapshot("order", orderId))!;
    await b.client.enqueue(pay(seenByB, amountDueOf(seenByB)));
    await b.syncUntilIdle();

    a.network.online = true;
    await syncUntilConverged([a, b]);

    // The tea is not on the order, and the till says so rather than dropping it: the refused
    // save is on its "needs attention" list with the order as the server holds it.
    const refused = await a.client.rejectedCommands();
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatchObject({
      code: "SYNC_ORDER_VERSION_STALE",
      entityId: orderId,
      command: { type: "order.save_draft" },
      serverSnapshot: { status: "paid" },
    });
    expect(orderOf(await a.client.snapshot("order", orderId))).toMatchObject({ status: "paid" });
    const stored = (await storedOrders(server, shop)).get(orderId);
    expect(stored).toMatchObject({ status: "paid", lines: 1, payments: 1 });
    expect(await a.client.pendingCount()).toBe(0);
    await a.close();
    await b.close();
  });
});
