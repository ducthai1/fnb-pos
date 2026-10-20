import { join } from "node:path";
import type { SyncShop } from "@fnb/api/test-support/sync-shop";
import { newId, withTenant } from "@fnb/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SyncCommandEnvelope } from "@fnb/contracts";
import {
  type SyncTransport,
  createHttpSyncTransport,
  createSqliteLocalStore,
  createSyncClient,
} from "../../src";
import { openNodeSqliteDriver } from "../../src/local-store/node-sqlite-driver";
import { scratchDirectory } from "../../src/local-store/local-store-test-support";
import { amountDueOf } from "../support/order-amount-due";
import { orderOf, pay, pick, saveDraft } from "../support/order-commands";
import { ScenarioServer } from "../support/scenario-server";
import { virtualClock } from "../support/virtual-clock";

const dir = scratchDirectory("hand-over");
let server: ScenarioServer;
let shop: SyncShop;

beforeAll(async () => ({ server, shop } = await ScenarioServer.withShop()));
afterAll(async () => {
  await server.close();
  dir.remove();
});

const json = (body: unknown) => JSON.stringify(body);

/** A cashier hired at the shop's branch and signed in on till A: their session. */
async function cashierOnTillA(name: string, pin: string) {
  const hired = await server.send({
    method: "POST",
    path: "/staff",
    headers: { cookie: shop.shop.managerCookie, "content-type": "application/json" },
    body: json({
      displayName: name,
      roleId: shop.shop.roleIds.cashier,
      pin,
      branchIds: [shop.shop.branchId],
    }),
  });
  const staffId = JSON.parse(hired.body).staffId as string;
  const signedIn = await server.send({
    method: "POST",
    path: "/pos/staff-sessions",
    headers: {
      authorization: `Device ${shop.tillA.deviceToken}`,
      "content-type": "application/json",
    },
    body: json({ staffId, pin }),
  });
  const session = JSON.parse(signedIn.body) as {
    staffSessionToken: string;
    staffSessionId: string;
  };
  return { staffId, token: session.staffSessionToken, sessionId: session.staffSessionId };
}

const authorsOf = (orderId: string) =>
  withTenant(server.pool, shop.shop.tenantId, async (client) => {
    const { rows } = await client.query(
      "SELECT o.created_by AS opened_by, p.received_by_staff_id AS paid_to FROM sales_order o " +
        "JOIN payment p ON p.order_id = o.id WHERE o.id = $1",
      [orderId],
    );
    return rows;
  });

describe("a till handed over before its first cashier's sale synced", () => {
  it("records that sale as the first cashier's, and the next one as the second's", async () => {
    const lan = await cashierOnTillA("Lan", "4826");
    const minh = await cashierOnTillA("Minh", "5162");
    // The till pushes each batch under the session its commands were recorded in.
    const tokens = new Map([
      [lan.sessionId, lan.token],
      [minh.sessionId, minh.token],
    ]);
    let pushing: string | null = null;
    const http = createHttpSyncTransport({
      send: server.send,
      deviceToken: shop.tillA.deviceToken,
      staffSessionToken: () => pushing,
    });
    const transport: SyncTransport = {
      pullChanges: (cursor, limit) => http.pullChanges(cursor, limit),
      pushCommands(batch: readonly SyncCommandEnvelope[]) {
        pushing = tokens.get(batch[0]?.staffSessionId ?? "") ?? null;
        return http.pushCommands(batch);
      },
    };
    const store = createSqliteLocalStore(openNodeSqliteDriver(join(dir.path, "a.db")));
    const client = createSyncClient({
      store,
      transport,
      deviceId: shop.tillA.deviceId,
      clock: virtualClock().clock,
      random: () => 0.5,
    });
    const coffee = () => ({ ...pick(shop.menu.coffee.id, 29_000), lineId: newId() });
    const sell = async (deviceOrderNo: number, sessionId: string) => {
      const id = newId();
      const stamp = { staffSessionId: sessionId };
      await client.enqueue(saveDraft({ id, deviceOrderNo, base: null }, [coffee()], stamp));
      const shown = orderOf(await client.snapshot("order", id))!;
      await client.enqueue(pay(shown, amountDueOf(shown), stamp));
      return id;
    };
    // Lan sells while the network is out, hands over to Minh, who sells too; then it syncs.
    const lansSale = await sell(1, lan.sessionId);
    const minhsSale = await sell(2, minh.sessionId);
    for (let pass = 0; pass < 10 && (await client.pendingCount()) > 0; pass += 1) {
      expect((await client.syncOnce()).failure).toBeNull();
    }
    expect(await client.pendingCount()).toBe(0);
    expect(await client.rejectedCommands()).toEqual([]);
    expect(await authorsOf(lansSale)).toEqual([{ opened_by: lan.staffId, paid_to: lan.staffId }]);
    expect(await authorsOf(minhsSale)).toEqual([
      { opened_by: minh.staffId, paid_to: minh.staffId },
    ]);
    await store.close();
  });
});
