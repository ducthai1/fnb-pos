import type { SyncShop } from "@fnb/api/test-support/sync-shop";
import { newId } from "@fnb/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { HttpSend } from "../../src";
import { scratchDirectory } from "../../src/local-store/local-store-test-support";
import { amountDueOf } from "../support/order-amount-due";
import { itemsOf, orderOf, pay, pick, saveDraft } from "../support/order-commands";
import { ScenarioServer } from "../support/scenario-server";
import { ScenarioTill } from "../support/scenario-till";
import { serverLedger, storedOrders } from "../support/server-truth";
import { virtualClock } from "../support/virtual-clock";

const dir = scratchDirectory("out-of-order");
let server: ScenarioServer;
let shop: SyncShop;

beforeAll(async () => ({ server, shop } = await ScenarioServer.withShop()));
afterAll(async () => {
  await server.close();
  dir.remove();
});

/** Delivers the first push with its commands rearranged, the way a broken proxy might. */
function rearrangingFirstPush(send: HttpSend, rearrange: (commands: unknown[]) => unknown[]) {
  let done = false;
  const wrapped: HttpSend = (request) => {
    if (done || request.method !== "POST" || request.body === undefined) return send(request);
    done = true;
    const { commands } = JSON.parse(request.body) as { commands: unknown[] };
    return send({ ...request, body: JSON.stringify({ commands: rearrange(commands) }) });
  };
  return wrapped;
}

describe("a till's commands arriving out of device_seq order", () => {
  for (const [how, rearrange] of [
    ["reversed", (commands: unknown[]) => [...commands].reverse()],
    ["without the first", (commands: unknown[]) => commands.slice(1)],
  ] as const) {
    it(`are retried, sent again in order and applied once each (${how})`, async () => {
      const till = new ScenarioTill(
        rearrangingFirstPush(server.send, rearrange),
        how === "reversed" ? shop.tillA : shop.tillB,
        { dir: dir.path, name: how, seed: 3, clock: virtualClock().clock },
      );
      const orderId = newId();
      await till.client.enqueue(
        saveDraft({ id: orderId, deviceOrderNo: 1, base: null }, [
          pick(shop.menu.coffee.id, 29_000),
        ]),
      );
      const first = orderOf(await till.client.snapshot("order", orderId))!;
      const tea = pick(shop.menu.peachTea.id, 45_000, { variantId: shop.menu.peachTea.sizeL });
      await till.client.enqueue(
        saveDraft({ id: orderId, deviceOrderNo: 1, base: first }, [...itemsOf(first), tea]),
      );
      const second = orderOf(await till.client.snapshot("order", orderId))!;
      await till.client.enqueue(pay(second, amountDueOf(second)));

      const [retried, ...rest] = await till.syncUntilIdle();
      expect(retried).toMatchObject({ accepted: [], retried: how === "reversed" ? 3 : 2 });
      expect(retried?.failure).toEqual({ stage: "push", kind: "out_of_order" });
      expect(rest.flatMap((report) => report.accepted)).toHaveLength(3);
      expect((await storedOrders(server, shop)).get(orderId)).toEqual({
        status: "paid",
        version: 3,
        lines: 2,
        payments: 1,
        paid: 74_000,
      });
      expect(await serverLedger(server, shop, till.till)).toMatchObject({
        accepted: 3,
        rejected: 0,
      });
      expect(await till.client.rejectedCommands()).toEqual([]);
      await till.close();
    });
  }
});
