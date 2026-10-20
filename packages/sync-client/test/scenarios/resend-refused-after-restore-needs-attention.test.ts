import { afterEach, describe, expect, it } from "vitest";
import {
  type Cleanups,
  raisePeachTea,
  resentAudits,
  restorableShop,
  sell,
} from "../support/restorable-shop";
import { storedOrders } from "../support/server-truth";

const cleanups: Cleanups = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("a command sent again to a restored server whose data changed since", () => {
  it("is refused onto the till's needs-attention list, never dropped in silence", async () => {
    const { server, shop, tillOf, backUp } = await restorableShop(cleanups);
    const a = tillOf("a", shop.tillA, 51);
    await a.syncUntilIdle();
    const backup = await backUp();
    const sold = await sell(a, shop, 1, "peachTea");
    await a.syncUntilIdle();
    expect((await storedOrders(server, shop)).get(sold)?.status).toBe("paid");

    await backup.restoreInto(server);
    // The manager raises the price before the till is back: the server now prices the
    // resent draft higher than the cash the till took for it.
    await raisePeachTea(server, shop);
    const reports = await a.syncUntilIdle();

    const [refused, ...others] = await a.client.rejectedCommands();
    expect(others).toEqual([]);
    expect(refused).toMatchObject({
      entity: "order",
      entityId: sold,
      code: "DOMAIN_ORDER_TOTAL_MISMATCH",
      command: { type: "order.pay" },
    });
    expect(reports.flatMap((report) => report.rejected)).toEqual([refused?.command.commandId]);
    expect((await storedOrders(server, shop)).get(sold)).toMatchObject({
      status: "draft",
      payments: 0,
    });
    expect((await a.client.snapshot("order", sold))?.snapshot).toMatchObject({ status: "draft" });
    expect(await resentAudits(server, shop, shop.tillA.deviceId)).toEqual(["accepted", "rejected"]);
    expect(await a.client.restoreState()).toEqual({ resending: 0, unrecoverable: 0 });
  });
});
