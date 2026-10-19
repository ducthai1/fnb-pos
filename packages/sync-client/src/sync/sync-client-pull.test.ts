import { describe, expect, it } from "vitest";
import { testId } from "../local-store/local-store-test-support";
import { SYNC_CLIENT_ERROR_CODES } from "../sync-client-error";
import { answer, change, draft, order, page, scriptedTill } from "./sync-client-test-support";

describe("pulling the change feed", () => {
  it("pulls while the till's own commands are still pending, and shows other rows at once", async () => {
    const { client, server } = scriptedTill();
    const mine = testId();
    const theirs = testId();
    await client.enqueue(draft(mine, 1, { lines: 1 }));
    server.script.pull = (cursor) =>
      cursor === "0"
        ? page([change(1, order(theirs, 4)), change(2, order(mine, 2, { lines: 9 }))])
        : page([], cursor);
    const report = await client.syncOnce();
    expect(report).toMatchObject({ pending: 1, pulled: 2, caughtUp: true });
    expect(report.failure?.stage).toBe("push");
    expect(await client.snapshot("order", theirs)).toMatchObject({ source: "server" });
    expect(await client.snapshot("order", mine)).toMatchObject({
      source: "optimistic",
      serverVersion: 2,
      snapshot: { lines: 1 },
    });
  });

  it("never rolls a row back to an older answer that arrives after a newer pulled change", async () => {
    const { client, server } = scriptedTill();
    const orderId = testId();
    await client.enqueue(draft(orderId, 1, { by: "this till" }));
    // The push is applied but its answer is lost; meanwhile another till changed the order.
    server.script.pull = (cursor) =>
      cursor === "0"
        ? page([change(7, order(orderId, 3, { by: "other till" }))])
        : page([], cursor);
    await client.syncOnce();
    // The resend is answered with the result stored the first time: version 2.
    server.script.push = (batch) =>
      batch.map((c) => answer(c, "accepted", { snapshot: order(orderId, 2, { by: "this till" }) }));
    await client.syncOnce();
    expect(await client.snapshot("order", orderId)).toMatchObject({
      source: "server",
      serverVersion: 3,
      snapshot: { by: "other till" },
    });
  });

  it("takes a newer answer over an older pulled change", async () => {
    const { client, server } = scriptedTill();
    const orderId = testId();
    await client.enqueue(draft(orderId));
    server.script.pull = (cursor) =>
      cursor === "0" ? page([change(1, order(orderId, 1))]) : page([], cursor);
    server.script.push = (batch) =>
      batch.map((c) => answer(c, "accepted", { snapshot: order(orderId, 2, { mine: true }) }));
    await client.syncOnce();
    expect(await client.snapshot("order", orderId)).toMatchObject({
      serverVersion: 2,
      snapshot: { mine: true },
    });
  });

  it("reads page after page to the feed's end, at most maxPullPages in one pass", async () => {
    const { client, server } = scriptedTill({ pullLimit: 2, maxPullPages: 2 });
    const ids = Array.from({ length: 5 }, () => testId());
    server.script.pull = (cursor, limit) => {
      const from = Number(cursor);
      const changes = ids
        .slice(from, from + limit)
        .map((id, i) => change(from + i + 1, order(id, 1)));
      return changes.length > 0 ? page(changes) : page([], cursor);
    };
    const first = await client.syncOnce();
    expect(first).toMatchObject({ pulled: 4, caughtUp: false });
    const second = await client.syncOnce();
    expect(second).toMatchObject({ pulled: 1, caughtUp: true });
    expect(server.pulls.map((p) => p.cursor)).toEqual(["0", "2", "4"]);
    expect(await client.snapshots("order")).toHaveLength(5);
  });

  it("refuses a page whose cursor goes back, keeping nothing of it", async () => {
    const { client, server, store } = scriptedTill();
    const kept = testId();
    const refused = testId();
    server.script.pull = () => page([change(5, order(kept, 1))]);
    await client.syncOnce();
    server.script.pull = () => page([change(6, order(refused, 1))], "3");
    const report = await client.syncOnce();
    expect(report.failure).toEqual({
      stage: "pull",
      kind: "protocol",
      code: SYNC_CLIENT_ERROR_CODES.cursorRegressed,
    });
    expect(await store.cursor()).toBe("5");
    expect(await client.snapshot("order", refused)).toBeNull();
    server.script.pull = () => page([change(8, order(refused, 1))], "7");
    expect((await client.syncOnce()).failure?.code).toBe(SYNC_CLIENT_ERROR_CODES.cursorRegressed);
    server.script.pull = () => page([], "4");
    expect((await client.syncOnce()).failure?.code).toBe(SYNC_CLIENT_ERROR_CODES.cursorRegressed);
    expect(await store.cursor()).toBe("5");
  });

  it("refuses a change at or before its cursor, and a cursor that is not a change number", async () => {
    const { client, server } = scriptedTill();
    server.script.pull = () => page([change(5, order(testId(), 1))]);
    await client.syncOnce();
    server.script.pull = () => page([change(5, order(testId(), 2))], "6");
    expect((await client.syncOnce()).failure?.code).toBe(SYNC_CLIENT_ERROR_CODES.staleChange);
    server.script.pull = () => page([], "six");
    expect((await client.syncOnce()).failure?.code).toBe(SYNC_CLIENT_ERROR_CODES.unreadableCursor);
  });
});

describe("telling the screen what changed", () => {
  it("reports rows whose shown copy changed, and nothing for a copy it already shows", async () => {
    const { client, server } = scriptedTill();
    const orderId = testId();
    const calls: string[][] = [];
    client.onChange((changed) => calls.push(changed.map((ref) => ref.entityId)));
    await client.enqueue(draft(orderId));
    server.script.push = (batch) =>
      batch.map((c) => answer(c, "accepted", { snapshot: order(orderId, 2) }));
    server.script.pull = (cursor) =>
      cursor === "0" ? page([change(1, order(orderId, 2))]) : page([], cursor);
    await client.syncOnce();
    expect(calls).toEqual([[orderId], [orderId]]);
  });

  it("keeps syncing when a listener throws", async () => {
    const { client, server } = scriptedTill();
    client.onChange(() => {
      throw new Error("screen bug");
    });
    server.script.push = (batch) => batch.map((c) => answer(c, "accepted"));
    await client.enqueue(draft(testId()));
    expect(await client.syncOnce()).toMatchObject({ pending: 0, failure: null });
  });
});
