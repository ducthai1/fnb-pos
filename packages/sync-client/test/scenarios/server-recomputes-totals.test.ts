import type { SyncShop } from "@fnb/api/test-support/sync-shop";
import { newId } from "@fnb/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scratchDirectory } from "../../src/local-store/local-store-test-support";
import { amountDueOf } from "../support/order-amount-due";
import { orderOf, pay, pick, saveDraft } from "../support/order-commands";
import { ScenarioServer } from "../support/scenario-server";
import { ScenarioTill } from "../support/scenario-till";
import { storedOrders } from "../support/server-truth";
import { virtualClock } from "../support/virtual-clock";

const dir = scratchDirectory("server-totals");
let server: ScenarioServer;
let shop: SyncShop;

beforeAll(async () => ({ server, shop } = await ScenarioServer.withShop()));
afterAll(async () => {
  await server.close();
  dir.remove();
});

describe("a till whose copy of the menu has the wrong prices", () => {
  it("shows its own price until the server's row, priced from the catalog, replaces it", async () => {
    const till = new ScenarioTill(server.send, shop.tillA, {
      dir: dir.path,
      name: "a",
      seed: 9,
      clock: virtualClock().clock,
    });
    const { coffee } = shop.menu;
    const orderId = newId();
    // Cà phê sữa 29.000đ + Thêm shot 10.000đ, but the till's copy says 1đ for both.
    const coffeeWithShot = pick(coffee.id, 1, {
      quantity: "2",
      modifiers: [
        { groupId: coffee.extrasGroup, optionId: coffee.extraShot, quantity: 1, shownPrice: 1 },
      ],
    });
    await till.client.enqueue(
      saveDraft({ id: orderId, deviceOrderNo: 1, base: null }, [coffeeWithShot]),
    );
    const optimistic = orderOf(await till.client.snapshot("order", orderId))!;
    expect(amountDueOf(optimistic)).toBe(4);
    // The cashier takes what the till asks for, before the draft has even synced.
    const underpaid = await till.client.enqueue(pay(optimistic, amountDueOf(optimistic)));
    await till.syncUntilIdle();

    const shown = orderOf(await till.client.snapshot("order", orderId))!;
    expect((await till.client.snapshot("order", orderId))?.source).toBe("server");
    expect(shown.status).toBe("draft");
    expect(shown.lines.map((line) => [line.lineType, line.unitPrice])).toEqual([
      ["item", 29_000],
      ["modifier", 10_000],
    ]);
    expect(amountDueOf(shown)).toBe(78_000);
    expect(await till.client.rejectedCommands()).toMatchObject([
      { command: { commandId: underpaid.commandId }, code: "DOMAIN_ORDER_TOTAL_MISMATCH" },
    ]);
    expect((await storedOrders(server, shop)).get(orderId)).toMatchObject({ payments: 0 });

    await till.client.enqueue(pay(shown, amountDueOf(shown)));
    await till.syncUntilIdle();
    expect((await storedOrders(server, shop)).get(orderId)).toMatchObject({
      status: "paid",
      payments: 1,
      paid: 78_000,
    });
    await till.close();
  });
});
