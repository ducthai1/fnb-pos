import { describe, expect, it } from "vitest";
import { testId } from "../local-store/local-store-test-support";
import { answer, change, draft, order, page, scriptedTill } from "./sync-client-test-support";

const OLD = "0192f5a4-0000-7000-8000-00000000000a";
const NEW = "0192f5a4-0000-7000-8000-00000000000b";

/** A till that sold `orders` orders the server took, all under OLD, and pulled to seq 120. */
async function tillInStepWithOld(orders: number) {
  const till = scriptedTill();
  const { client, server } = till;
  for (let n = 0; n < orders; n += 1) await client.enqueue(draft(testId()));
  server.script.push = (batch) => batch.map((command) => answer(command, "accepted"));
  server.script.pull = (cursor) => ({
    ...(cursor === "0" ? page([change(120, order(testId(), 1))]) : page([], cursor)),
    serverGeneration: OLD,
  });
  await client.syncOnce();
  expect(await client.pendingCount()).toBe(0);
  return till;
}

describe("a till meeting the server's generation", () => {
  it("remembers the first one silently: nothing is sent again, the cursor stays", async () => {
    const { client, server, store, deviceStates } = await tillWithCounter(2);
    expect(await store.serverGeneration()).toBe(OLD);
    expect(await store.cursor()).toBe("120");
    await client.syncOnce();
    expect(server.pulls.at(-1)?.cursor).toBe("120");
    expect(deviceStates()).toBe(0);
  });

  it("changes nothing when the server names no generation", async () => {
    const { client, server, store } = scriptedTill();
    server.script.pull = (cursor) => page(cursor === "0" ? [change(3, order(testId(), 1))] : []);
    await client.syncOnce();
    await client.syncOnce();
    expect(await store.serverGeneration()).toBeNull();
    expect(server.pulls.map((pull) => pull.cursor)).toEqual(["0", "3"]);
  });

  it("after a restore, sends again what the server lost and pulls the feed from the start", async () => {
    const { client, server, deviceStates } = await tillWithCounter(3);
    await client.enqueue(draft(testId()));
    server.script.deviceState = () => ({ serverGeneration: NEW, lastDeviceSeq: 1 });
    server.script.pull = (cursor) => ({
      ...(cursor === "0" ? page([change(101, order(testId(), 1))]) : page([], cursor)),
      serverGeneration: NEW,
    });
    // The first push carries seq 4 alone and the restored server asks for seq 2 first.
    server.script.push = (batch) => batch.map((command) => answer(command, "retry"));
    const report = await client.syncOnce();
    expect(report.restore).toEqual({ resent: 2, unrecoverable: 0 });
    expect(deviceStates()).toBe(1);
    expect(server.pulls.slice(-2).map((pull) => pull.cursor)).toEqual(["120", "0"]);
    expect(await client.restoreState()).toEqual({ resending: 2, unrecoverable: 0 });

    server.script.push = (batch) => batch.map((command) => answer(command, "accepted"));
    await client.syncOnce();
    const resent = server.pushes.at(-1) ?? [];
    expect(resent.map((command) => command.deviceSeq)).toEqual([2, 3, 4]);
    expect(resent.map((command) => command.resentFromGeneration)).toEqual([OLD, OLD, undefined]);
    expect(await client.restoreState()).toEqual({ resending: 0, unrecoverable: 0 });
    expect((await client.syncOnce()).restore).toBeNull();
    expect(deviceStates()).toBe(1);
  });
});

async function tillWithCounter(orders: number) {
  const till = await tillInStepWithOld(orders);
  return { ...till, deviceStates: till.server.deviceStatesAsked };
}
