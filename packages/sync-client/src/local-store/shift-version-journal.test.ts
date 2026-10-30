import type { SyncCommandEnvelope, SyncCommandResult } from "@fnb/contracts";
import { describe, expect, it } from "vitest";
import { answer, draft, testId } from "./local-store-fixtures";
import { openNodeSqliteDriver } from "./node-sqlite-driver";
import { createSqliteLocalStore } from "./sqlite-local-store";

/** An accepted answer that names the shift version the command's cash reaches. */
const acceptedAt = (command: SyncCommandEnvelope, shiftVersion: number): SyncCommandResult =>
  ({
    ...answer(command, "accepted"),
    shiftVersion,
  }) as SyncCommandResult;

function newStore() {
  const driver = openNodeSqliteDriver(":memory:");
  return { driver, store: createSqliteLocalStore(driver) };
}

describe("the shift version an accepted answer names", () => {
  it("is kept with the command and listed newest first, only for the answers that name one", async () => {
    const { store } = newStore();
    const first = (await store.enqueue(draft(testId()))).command;
    const second = (await store.enqueue(draft(testId()))).command;
    const third = (await store.enqueue(draft(testId()))).command;
    await store.recordResults(
      [first, second, third],
      [acceptedAt(first, 5), answer(second, "accepted"), acceptedAt(third, 6)],
    );
    const listed = await store.acceptedShiftCommands(10);
    expect(listed.map((entry) => [entry.command.commandId, entry.shiftVersion])).toEqual([
      [third.commandId, 6],
      [first.commandId, 5],
    ]);
    expect(listed[0]?.command.deviceSeq).toBe(third.deviceSeq);
    expect((await store.acceptedShiftCommands(1)).length).toBe(1);
  });

  it("is not kept for a refused or a retried command, or one still waiting", async () => {
    const { store } = newStore();
    const refused = (await store.enqueue(draft(testId()))).command;
    const waiting = (await store.enqueue(draft(testId()))).command;
    await store.recordResults(
      [refused],
      [{ ...answer(refused, "rejected"), shiftVersion: 3 } as never],
    );
    expect(waiting.commandId).not.toBe("");
    expect(await store.acceptedShiftCommands(10)).toEqual([]);
  });

  it("is added to a journal made before the column existed, keeping what it holds", async () => {
    const driver = openNodeSqliteDriver(":memory:");
    driver.exec(
      "CREATE TABLE outbox (device_seq INTEGER PRIMARY KEY AUTOINCREMENT, command_id TEXT NOT NULL UNIQUE, " +
        "type TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT NOT NULL, envelope TEXT NOT NULL, " +
        "status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')), result_code TEXT)",
    );
    const store = createSqliteLocalStore(driver);
    const command = (await store.enqueue(draft(testId()))).command;
    await store.recordResults([command], [acceptedAt(command, 2)]);
    expect((await store.acceptedShiftCommands(5)).map((entry) => entry.shiftVersion)).toEqual([2]);
  });
});
