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
    expect([1, 2, 99, 100, 101, 250].map((n) => callNumberOf(n))).toEqual(["1", "2", "99", "100", "1", "50"]);
  });

  it("keeps the plain numbers on a branch with one till, whatever its index", () => {
    const alone = { deviceIndex: 1, tillsInBranch: 1 };
    expect([1, 99, 100, 101].map((n) => callNumberOf(n, alone))).toEqual(["1", "99", "100", "1"]);
  });

  it("puts the till's index in the hundreds from two tills on, so two tills never call the same number", () => {
    const first = { deviceIndex: 1, tillsInBranch: 2 };
    const second = { deviceIndex: 2, tillsInBranch: 2 };
    expect([1, 2, 99, 101].map((n) => callNumberOf(n, first))).toEqual(["101", "102", "199", "101"]);
    expect([1, 2, 99, 101].map((n) => callNumberOf(n, second))).toEqual(["201", "202", "299", "201"]);
    const called = new Set<string>();
    for (let n = 1; n <= 99; n += 1) {
      called.add(callNumberOf(n, first));
      called.add(callNumberOf(n, second));
    }
    expect(called.size).toBe(198);
  });

  it("keeps the plain numbers on a till that holds no index (more than nine tills)", () => {
    const crowded = { deviceIndex: null, tillsInBranch: 12 };
    expect([1, 100, 101].map((n) => callNumberOf(n, crowded))).toEqual(["1", "100", "1"]);
  });
});
