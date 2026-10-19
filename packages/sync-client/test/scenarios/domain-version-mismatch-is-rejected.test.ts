import type { SyncShop } from "@fnb/api/test-support/sync-shop";
import { newId } from "@fnb/db";
import { DOMAIN_VERSION } from "@fnb/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scratchDirectory } from "../../src/local-store/local-store-test-support";
import { amountDueOf } from "../support/order-amount-due";
import { orderOf, pay, pick, saveDraft } from "../support/order-commands";
import { ScenarioServer } from "../support/scenario-server";
import { ScenarioTill } from "../support/scenario-till";
import { storedOrders } from "../support/server-truth";
import { virtualClock } from "../support/virtual-clock";

const dir = scratchDirectory("domain-version");
let server: ScenarioServer;
let shop: SyncShop;
let till: ScenarioTill;

const UNSUPPORTED = "SYNC_DOMAIN_VERSION_UNSUPPORTED";
/** Older than the oldest rules the server still accepts. */
const OLD_RULES = "0.0.9";

beforeAll(async () => {
  ({ server, shop } = await ScenarioServer.withShop());
  till = new ScenarioTill(server.send, shop.tillA, {
    dir: dir.path,
    name: "a",
    seed: 5,
    clock: virtualClock().clock,
  });
});
afterAll(async () => {
  await till.close();
  await server.close();
  dir.remove();
});

const coffee = () => [pick(shop.menu.coffee.id, 29_000)];

describe("a command computed with domain rules the server no longer accepts", () => {
  it("is refused for good, kept for the cashier, and does not hold up the commands behind it", async () => {
    const stale = newId();
    const current = newId();
    const refused = await till.client.enqueue(
      saveDraft({ id: stale, deviceOrderNo: 1, base: null }, coffee(), {
        domainVersion: OLD_RULES,
      }),
    );
    await till.client.enqueue(saveDraft({ id: current, deviceOrderNo: 2, base: null }, coffee()));
    const report = (await till.syncUntilIdle())[0];
    expect(report?.rejected).toEqual([refused.commandId]);
    expect(report?.accepted).toHaveLength(1);
    expect(await till.client.rejectedCommands()).toMatchObject([
      {
        entityId: stale,
        code: UNSUPPORTED,
        command: { commandId: refused.commandId },
        serverSnapshot: null,
      },
    ]);
    // The server never stored the order, so the till stops showing it.
    expect(await till.client.snapshot("order", stale)).toBeNull();
    const stored = await storedOrders(server, shop);
    expect(stored.has(stale)).toBe(false);
    expect(stored.get(current)).toMatchObject({ status: "draft" });
  });

  it("puts the server's row back over the till's expectation when the order exists", async () => {
    const orderId = newId();
    await till.client.enqueue(saveDraft({ id: orderId, deviceOrderNo: 3, base: null }, coffee()));
    await till.syncUntilIdle();
    const shown = orderOf(await till.client.snapshot("order", orderId))!;
    const refused = await till.client.enqueue(
      pay(shown, amountDueOf(shown), { domainVersion: OLD_RULES }),
    );
    expect(orderOf(await till.client.snapshot("order", orderId))?.status).toBe("paid");
    await till.syncUntilIdle();
    expect(await till.client.snapshot("order", orderId)).toMatchObject({
      source: "server",
      snapshot: { status: "draft", payments: [] },
    });
    const filed = (await till.client.rejectedCommands()).find(
      (rejection) => rejection.command.commandId === refused.commandId,
    );
    expect(filed).toMatchObject({ code: UNSUPPORTED, serverSnapshot: { status: "draft" } });
    expect((await storedOrders(server, shop)).get(orderId)).toMatchObject({
      status: "draft",
      payments: 0,
    });
    // The same payment with today's rules goes through.
    await till.client.enqueue(pay(shown, amountDueOf(shown), { domainVersion: DOMAIN_VERSION }));
    await till.syncUntilIdle();
    expect((await storedOrders(server, shop)).get(orderId)).toMatchObject({
      status: "paid",
      payments: 1,
    });
  });
});
