import type { SyncCommandEnvelope } from "@fnb/contracts";
import { type SqliteDriver, inTransaction } from "./sqlite-driver";

/*
 * A shop PC's clock can be minutes off (a flat CMOS battery, Windows time sync stopped),
 * and the server does not take a command dated more than two minutes after it arrived. So
 * the till keeps how far the server's clock is from its own, measured on every answer that
 * names it, and dates each command it records by the server's clock: its own reading plus
 * that offset, the last one kept while offline. The outbox keeps the till's own reading
 * too, so a command the server sent back is dated again from that reading with a fresher
 * offset: never shifted twice, however many times it comes back.
 */

const OFFSET_KEY = "clock_offset_ms";

/** Tills made before commands were dated by the server's clock have no such column yet. */
export function ensureClockColumns(driver: SqliteDriver): void {
  const columns = driver.all("PRAGMA table_info(outbox)").map((row) => String(row.name));
  if (!columns.includes("device_created_at")) {
    driver.exec("ALTER TABLE outbox ADD COLUMN device_created_at TEXT");
  }
}

export function readClockOffset(driver: SqliteDriver): number | null {
  const [row] = driver.all("SELECT value FROM sync_meta WHERE key = ?", [OFFSET_KEY]);
  return row === undefined ? null : Number(row.value);
}

export function saveClockOffset(driver: SqliteDriver, offsetMs: number): void {
  if (!Number.isSafeInteger(offsetMs)) throw new RangeError(`not a clock offset: ${offsetMs}`);
  driver.run(
    "INSERT INTO sync_meta (key, value) VALUES (?, ?) " +
      "ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    [OFFSET_KEY, String(offsetMs)],
  );
}

/** The till's own reading moved onto the server's clock. */
export const onServerClock = (deviceAt: string, offsetMs: number): string =>
  new Date(Date.parse(deviceAt) + offsetMs).toISOString();

/**
 * Dates the pending commands from `fromDeviceSeq` on again, from the till's own reading and
 * the offset now kept, none later than `notAfter`: the server's clock as it answered, and
 * every command of the batch it answered was made before that. (One recorded while the
 * answer travelled is held there too: a second or so early, never refused for it.) Only
 * commands the server never took are touched: it takes a till's commands in device_seq
 * order, so the one it sent back and every later one are new to it. Answers how many.
 */
export function retimePending(
  driver: SqliteDriver,
  fromDeviceSeq: number,
  notAfter: string,
): number {
  return inTransaction(driver, () => {
    const offset = readClockOffset(driver) ?? 0;
    const latest = Date.parse(notAfter);
    const rows = driver.all(
      "SELECT device_seq, envelope, device_created_at FROM outbox " +
        "WHERE status = 'pending' AND device_seq >= ? ORDER BY device_seq",
      [fromDeviceSeq],
    );
    for (const row of rows) {
      const envelope = JSON.parse(String(row.envelope)) as Omit<SyncCommandEnvelope, "deviceSeq">;
      // A command recorded before tills kept their own reading was dated by the till's clock.
      const deviceAt =
        row.device_created_at === null ? envelope.createdAt : String(row.device_created_at);
      const dated = Math.min(Date.parse(onServerClock(deviceAt, offset)), latest);
      driver.run("UPDATE outbox SET envelope = ?, device_created_at = ? WHERE device_seq = ?", [
        JSON.stringify({ ...envelope, createdAt: new Date(dated).toISOString() }),
        deviceAt,
        row.device_seq ?? null,
      ]);
    }
    return rows.length;
  });
}
