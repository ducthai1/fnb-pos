import { setTimeout as sleep } from "node:timers/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { ChangeWire } from "../shared/sync-wire-types";
import { createCommand, pull, push, startTestPostgres } from "./server-test-harness";
import { type RunningSyncServer, startSyncServer } from "./sync-server-app";

let harness: Awaited<ReturnType<typeof startTestPostgres>>;
let server: RunningSyncServer;

beforeAll(async () => {
  harness = await startTestPostgres();
});
afterAll(async () => harness.stop());
afterEach(async () => server.close());

/**
 * Till A's transaction draws its change_seq first but commits last; till B commits in
 * between and a third till pulls while A is still open. Returns the order ids that the
 * puller ends up with after it pulls again from the cursor it saved.
 */
async function pullerSeesAcrossLateCommit(serializeChanges: boolean) {
  const first = createCommand(1);
  // Another business day, so the two transactions share no row (the day-total row would
  // otherwise serialise them by row lock and hide the problem this test is about).
  const second = createCommand(1, undefined, undefined, "2026-10-21");
  let release!: () => void;
  let entered!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const inside = new Promise<void>((resolve) => (entered = resolve));
  server = await startSyncServer({
    connectionString: await harness.freshDatabase(),
    serializeChanges,
    beforeCommit: async (command) => {
      if (command.command_id !== first.command_id) return;
      entered();
      await held;
    },
  });
  const pushA = push(server.url, "till-a", [first]);
  await inside;
  const pushB = push(server.url, "till-b", [second]);
  await sleep(200);
  const during = await pull(server.url, "0");
  release();
  await Promise.all([pushA, pushB]);
  const after = await pull(server.url, during.next_cursor);
  const orderIds = (changes: ChangeWire[]) =>
    changes.filter((c) => c.entity === "order").map((c) => c.data.id);
  return {
    firstId: first.payload.order_id,
    secondId: second.payload.order_id,
    seen: [...orderIds(during.changes), ...orderIds(after.changes)],
  };
}

describe("GET /changes with a bigserial cursor", () => {
  it("never lets a puller skip a change whose transaction commits after a later one", async () => {
    const { firstId, secondId, seen } = await pullerSeesAcrossLateCommit(true);
    expect(seen).toEqual([firstId, secondId]);
  });

  it("loses the late change when change_seq is drawn without serialising commits", async () => {
    const { firstId, secondId, seen } = await pullerSeesAcrossLateCommit(false);
    expect(seen).toEqual([secondId]);
    expect(seen).not.toContain(firstId);
  });

  it("pages through changes in change_seq order and reports when more remain", async () => {
    server = await startSyncServer({ connectionString: await harness.freshDatabase() });
    await push(server.url, "till-a", [createCommand(1), createCommand(2)]);
    const page1 = await pull(server.url, "0", 3);
    const page2 = await pull(server.url, page1.next_cursor, 3);
    const seqs = [...page1.changes, ...page2.changes].map((c) => Number(c.change_seq));
    expect(page1.has_more).toBe(true);
    expect(page2.has_more).toBe(false);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(4);
  });

  it("pages in numeric change_seq order once sequence numbers reach two digits", async () => {
    server = await startSyncServer({ connectionString: await harness.freshDatabase() });
    const commands = Array.from({ length: 13 }, (_, i) => createCommand(i + 1));
    await push(server.url, "till-a", commands);
    const seqs: number[] = [];
    let cursor = "0";
    for (let page = await pull(server.url, cursor, 5); ; page = await pull(server.url, cursor, 5)) {
      seqs.push(...page.changes.map((c) => Number(c.change_seq)));
      cursor = page.next_cursor;
      if (!page.has_more) break;
    }
    expect(seqs).toEqual(Array.from({ length: 26 }, (_, i) => i + 1));
  });
});
