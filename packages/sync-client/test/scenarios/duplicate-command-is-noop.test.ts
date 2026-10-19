import type { SyncShop, Till } from "@fnb/api/test-support/sync-shop";
import { newId } from "@fnb/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { HttpSend } from "../../src";
import { scratchDirectory } from "../../src/local-store/local-store-test-support";
import { type FaultPlan, NO_FAULTS } from "../support/flaky-network";
import { amountDueOf } from "../support/order-amount-due";
import { orderOf, pay, pick, saveDraft } from "../support/order-commands";
import { ScenarioServer } from "../support/scenario-server";
import { ScenarioTill } from "../support/scenario-till";
import { serverLedger, storedOrders } from "../support/server-truth";
import { virtualClock } from "../support/virtual-clock";

const dir = scratchDirectory("duplicates");
let server: ScenarioServer;
let shop: SyncShop;

beforeAll(async () => ({ server, shop } = await ScenarioServer.withShop()));
afterAll(async () => {
  await server.close();
  dir.remove();
});

/** The server applies the first push, then its answer never reaches the till. */
function firstPushAnswerLost(send: HttpSend): HttpSend {
  let lost = false;
  const losing: HttpSend = async (request) => {
    const response = await send(request);
    if (lost || request.method !== "POST") return response;
    lost = true;
    throw new TypeError("fetch failed: response lost");
  };
  return losing;
}

/** Opens and pays one order on `till` under `faults`, syncs, and returns what each side holds. */
async function sellOneUnder(till: Till, name: string, faults: FaultPlan, via = server.send) {
  const scenario = new ScenarioTill(via, till, {
    dir: dir.path,
    name,
    seed: 7,
    clock: virtualClock().clock,
    faults,
  });
  const orderId = newId();
  const draft = saveDraft({ id: orderId, deviceOrderNo: 1, base: null }, [
    pick(shop.menu.coffee.id, 29_000),
  ]);
  await scenario.client.enqueue(draft);
  const shown = orderOf(await scenario.client.snapshot("order", orderId))!;
  await scenario.client.enqueue(pay(shown, amountDueOf(shown)));
  const reports = await scenario.syncUntilIdle();
  const result = {
    scenario,
    reports,
    shown: orderOf(await scenario.client.snapshot("order", orderId)),
    stored: (await storedOrders(server, shop)).get(orderId),
    ledger: await serverLedger(server, shop, till),
    rejected: await scenario.client.rejectedCommands(),
  };
  await scenario.close();
  return result;
}

describe("a command that reaches the server twice", () => {
  it("is applied once when two copies of the batch arrive at the same moment", async () => {
    const faults = { ...NO_FAULTS, duplicate: 1 };
    const { scenario, shown, stored, ledger, rejected } = await sellOneUnder(
      shop.tillA,
      "a",
      faults,
    );
    expect(scenario.network.stats.duplicated).toBeGreaterThan(0);
    expect(stored).toEqual({ status: "paid", version: 2, lines: 1, payments: 1, paid: 29_000 });
    expect(ledger).toEqual({ accepted: 2, rejected: 0, changeRowsWrittenTwice: 0 });
    expect(shown).toMatchObject({ status: "paid", version: 2, payments: [{ amount: 29_000 }] });
    expect(rejected).toEqual([]);
  });

  it("is applied once when its answer is lost and the till sends it again", async () => {
    const via = firstPushAnswerLost(server.send);
    const { reports, shown, stored, ledger } = await sellOneUnder(shop.tillB, "b", NO_FAULTS, via);
    expect(reports[0]?.failure).toMatchObject({ stage: "push", kind: "network" });
    expect(reports.flatMap((report) => report.accepted)).toHaveLength(2);
    expect(stored).toEqual({ status: "paid", version: 2, lines: 1, payments: 1, paid: 29_000 });
    expect(ledger).toEqual({ accepted: 2, rejected: 0, changeRowsWrittenTwice: 0 });
    expect(shown).toMatchObject({ status: "paid", version: 2 });
  });
});
