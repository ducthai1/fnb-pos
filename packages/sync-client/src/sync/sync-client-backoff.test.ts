import { describe, expect, it } from "vitest";
import { testId } from "../local-store/local-store-test-support";
import { backoffDelayMs } from "./sync-clock";
import { SyncTransportError } from "./sync-transport";
import { answer, draft, scriptedTill } from "./sync-client-test-support";

describe("backing off after a failed pass", () => {
  it("waits twice as long after each failure in a row, up to the ceiling", async () => {
    const { client, time } = scriptedTill({ backoff: { baseMs: 100, maxMs: 1_000 } });
    await client.enqueue(draft(testId()));
    for (let i = 0; i < 7; i += 1) expect((await client.syncOnce()).failure?.kind).toBe("network");
    expect(time.sleeps).toEqual([100, 200, 400, 800, 1_000, 1_000]);
  });

  it("does not wait at all while passes succeed, and starts from the base after one does", async () => {
    const { client, server, time } = scriptedTill({ backoff: { baseMs: 100, maxMs: 1_000 } });
    await client.enqueue(draft(testId()));
    await client.syncOnce();
    await client.syncOnce();
    server.script.push = (batch) => batch.map((c) => answer(c, "accepted"));
    await client.syncOnce();
    await client.syncOnce();
    await client.enqueue(draft(testId()));
    server.script.push = () => {
      throw new SyncTransportError("network", null, "offline again");
    };
    await client.syncOnce();
    await client.syncOnce();
    expect(time.sleeps).toEqual([100, 200, 100]);
  });

  it("throws what is not a sync failure instead of backing off from it", async () => {
    const { client, server, time } = scriptedTill();
    await client.enqueue(draft(testId()));
    server.script.push = () => {
      throw new Error("bug in the till");
    };
    await expect(client.syncOnce()).rejects.toThrow("bug in the till");
    expect(time.sleeps).toEqual([]);
  });

  it("waits only for what is left of the backoff when time has already passed", async () => {
    const { client, time } = scriptedTill({ backoff: { baseMs: 100, maxMs: 1_000 } });
    await client.enqueue(draft(testId()));
    await client.syncOnce();
    time.advance(70);
    await client.syncOnce();
    expect(time.sleeps).toEqual([30]);
  });

  it("puts half of each wait at random so the tills of a shop do not retry in lockstep", () => {
    const policy = { baseMs: 1_000, maxMs: 60_000 };
    expect(backoffDelayMs(policy, 3, () => 0)).toBe(2_000);
    expect(backoffDelayMs(policy, 3, () => 1)).toBe(4_000);
    expect(backoffDelayMs(policy, 3, () => 0.5)).toBe(3_000);
    expect(backoffDelayMs(policy, 40, () => 1)).toBe(60_000);
  });
});
