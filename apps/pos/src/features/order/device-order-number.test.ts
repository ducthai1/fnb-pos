import type { EntityView } from "@fnb/sync-client";
import { describe, expect, it } from "vitest";
import { callNumberOf, nextDeviceOrderNo, orderNumbers } from "./device-order-number";

const TILL = "0190a000-0000-7000-8000-0000000000d1";
const OTHER_TILL = "0190a000-0000-7000-8000-0000000000d2";

const order = (deviceId: string, deviceOrderNo: unknown, n: number): EntityView => ({
  entity: "order",
  entityId: `0190a000-0000-7000-8000-${String(n).padStart(12, "0")}`,
  snapshot: { deviceId, deviceOrderNo },
  source: "server",
  serverVersion: 1,
});

const tillWith = (views: EntityView[]) => ({ snapshots: async () => views });

describe("the till's order numbers", () => {
  it("count on from the highest number this till has used, not another till's", async () => {
    const client = tillWith([order(TILL, 7, 1), order(OTHER_TILL, 40, 2), order(TILL, 3, 3)]);
    expect(await nextDeviceOrderNo(client, TILL, 0)).toBe(8);
  });

  it("skip past a number taken this session whose order the server has not answered for", async () => {
    expect(await nextDeviceOrderNo(tillWith([order(TILL, 7, 1)]), TILL, 9)).toBe(10);
  });

  it("start at 1 on a till with no orders, and ignore a snapshot without a number", async () => {
    expect(await nextDeviceOrderNo(tillWith([order(TILL, null, 1)]), TILL, 0)).toBe(1);
  });

  it("never hand the same number to two orders opened at once", async () => {
    const numbers = orderNumbers(tillWith([order(TILL, 4, 1)]), TILL);
    expect(await Promise.all([numbers.next(), numbers.next(), numbers.next()])).toEqual([5, 6, 7]);
  });
});

describe("the call number", () => {
  it("runs 1 to 100 and starts over, so two orders a hundred apart share one", () => {
    expect([1, 2, 99, 100, 101, 250].map(callNumberOf)).toEqual(["1", "2", "99", "100", "1", "50"]);
  });
});
