import { describe, expect, it } from "vitest";
import { answer, draft, testId } from "./local-store-fixtures";
import { LOCAL_SCHEMA_SQL } from "./local-store-schema-sql";
import { openNodeSqliteDriver } from "./node-sqlite-driver";
import { createSqliteLocalStore } from "./sqlite-local-store";

const DAY = 24 * 60 * 60 * 1000;
const at = (day: number) => new Date(Date.UTC(2026, 9, 1) + day * DAY).toISOString();

function journalOf() {
  const driver = openNodeSqliteDriver(":memory:");
  const store = createSqliteLocalStore(driver);
  const kept = () =>
    driver
      .all("SELECT device_seq, status FROM outbox ORDER BY device_seq")
      .map((row) => `${row.device_seq}:${row.status}`);
  return { driver, store, kept };
}

describe("the journal of commands the server answered", () => {
  it("keeps a settled command for the retention, then drops it", async () => {
    const { store, kept } = journalOf();
    const first = (await store.enqueue(draft(testId()))).command;
    const second = (await store.enqueue(draft(testId()))).command;
    await store.recordResults([first], [answer(first, "accepted")], at(0));
    await store.recordResults([second], [answer(second, "rejected")], at(3));
    expect(await store.pruneJournal(at(6), at(-1))).toBe(0);
    expect(kept()).toEqual(["1:accepted", "2:rejected"]);
    expect(await store.pruneJournal(at(8), at(1))).toBe(1);
    expect(kept()).toEqual(["2:rejected"]);
    expect(await store.pruneJournal(at(11), at(4))).toBe(1);
    expect(kept()).toEqual([]);
  });

  it("never drops a command still waiting for the server, however old", async () => {
    const { store, kept } = journalOf();
    await store.enqueue(draft(testId()));
    expect(await store.pruneJournal(at(400), at(399))).toBe(0);
    expect(kept()).toEqual(["1:pending"]);
  });

  it("never hands a dropped command's device_seq out again", async () => {
    const { store, kept } = journalOf();
    const first = (await store.enqueue(draft(testId()))).command;
    await store.recordResults([first], [answer(first, "accepted")], at(0));
    await store.pruneJournal(at(9), at(8));
    expect(kept()).toEqual([]);
    expect((await store.enqueue(draft(testId()))).command.deviceSeq).toBe(2);
  });

  it("gives commands settled on a till older than the journal a whole retention from today", async () => {
    const driver = openNodeSqliteDriver(":memory:");
    driver.exec(LOCAL_SCHEMA_SQL);
    driver.run(
      "INSERT INTO outbox (command_id, type, entity, entity_id, envelope, status) " +
        "VALUES (?, 'order.save_draft', 'order', ?, '{}', 'accepted')",
      [testId(), testId()],
    );
    const store = createSqliteLocalStore(driver);
    expect(await store.pruneJournal(at(10), at(3))).toBe(0);
    expect(await store.pruneJournal(at(16), at(9))).toBe(0);
    expect(await store.pruneJournal(at(18), at(11))).toBe(1);
  });
});
