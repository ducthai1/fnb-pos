import type { EntityRef, ServerRebase, StoreWrite } from "./local-store";
import { INITIAL_CURSOR } from "./apply-pulled-changes";
import { ChangeTracker } from "./entity-views";
import { READ_META_SQL, WRITE_META_SQL } from "./local-store-schema-sql";
import { type SqliteDriver, inTransaction } from "./sqlite-driver";

const GENERATION = "server_generation";
/** Set from a rebase until every server copy of the old generation was replaced or dropped. */
const REFRESHING = "refreshing_server_copies";
/** The highest device_seq a rebase put back in the queue; the POS counts what is left of it. */
const RESEND_THROUGH = "resend_through_seq";
/** device_seq numbers the server lacks and the journal no longer holds. */
const UNRECOVERABLE = "unrecoverable_commands";

const meta = (driver: SqliteDriver, key: string): string | null => {
  const [row] = driver.all(READ_META_SQL, [key]);
  return row === undefined ? null : String(row.value);
};

export const readServerGeneration = (driver: SqliteDriver) => meta(driver, GENERATION);

/** The first generation a till meets is just remembered: nothing tells it what came before. */
export function adoptServerGeneration(driver: SqliteDriver, generation: string): void {
  inTransaction(driver, () => {
    if (meta(driver, GENERATION) === null) driver.run(WRITE_META_SQL, [GENERATION, generation]);
  });
}

/**
 * Catches the till up with a server restored from a backup, in one transaction. Every
 * command the till numbered after the server's last one goes back in the queue in its
 * device_seq order, before anything recorded since: the server lost them, and takes a
 * till's commands only in order. Each carries the generation that lost it, for the audit.
 * The kept server copies belong to the lost timeline: they still show, but any copy the
 * new server sends replaces them, and the feed is pulled again from the start. The till's
 * own expectations of pending commands are untouched.
 */
export function rebaseOntoGeneration(
  driver: SqliteDriver,
  generation: string,
  serverLastSeq: number,
): ServerRebase {
  return inTransaction(driver, () => {
    const previous = meta(driver, GENERATION);
    const tracker = new ChangeTracker(driver);
    const settled = driver.all(
      "SELECT device_seq, command_id, entity, entity_id, envelope FROM outbox " +
        "WHERE device_seq > ? AND status <> 'pending' ORDER BY device_seq",
      [serverLastSeq],
    );
    for (const row of settled) {
      const ref: EntityRef = { entity: String(row.entity), entityId: String(row.entity_id) };
      tracker.touch(ref);
      const envelope = JSON.parse(String(row.envelope)) as Record<string, unknown>;
      const resent = previous === null ? envelope : { ...envelope, resentFromGeneration: previous };
      driver.run(
        "UPDATE outbox SET status = 'pending', result_code = NULL, settled_at = NULL, " +
          "envelope = ? WHERE device_seq = ?",
        [JSON.stringify(resent), row.device_seq ?? null],
      );
      // Answered again on resend; a refusal then lands on the "needs attention" list anew.
      driver.run("DELETE FROM rejected_command WHERE command_id = ?", [row.command_id ?? null]);
    }
    const unrecoverable = missingAfter(driver, serverLastSeq);
    driver.run("UPDATE entity_snapshot SET version = -1 WHERE source = 'server'");
    driver.run(WRITE_META_SQL, ["cursor", INITIAL_CURSOR]);
    driver.run(WRITE_META_SQL, [GENERATION, generation]);
    driver.run(WRITE_META_SQL, [REFRESHING, "1"]);
    const last = settled.at(-1)?.device_seq;
    if (last !== undefined && last !== null)
      driver.run(WRITE_META_SQL, [RESEND_THROUGH, String(last)]);
    driver.run(WRITE_META_SQL, [UNRECOVERABLE, String(unrecoverable)]);
    return { resent: settled.length, unrecoverable, changed: tracker.changed() };
  });
}

/**
 * How many device_seq numbers after the server's last one the till can no longer send:
 * journal rows dropped as older than the retention. Until they arrive the server answers
 * every later command "out of order", so the POS has to say so.
 */
function missingAfter(driver: SqliteDriver, serverLastSeq: number): number {
  const [first] = driver.all("SELECT min(device_seq) AS seq FROM outbox WHERE device_seq > ?", [
    serverLastSeq,
  ]);
  const [counter] = driver.all("SELECT seq FROM sqlite_sequence WHERE name = 'outbox'");
  const next = first?.seq ?? Number(counter?.seq ?? 0) + 1;
  return Math.max(0, Number(next) - serverLastSeq - 1);
}

/**
 * After the feed was pulled to its end following a rebase: a copy the new server never
 * sent again is of a row it does not hold, and goes. A row with a command of the till
 * still pending keeps its copy until that command's answer brings the server's row.
 */
export function dropCopiesTheServerLost(driver: SqliteDriver): StoreWrite {
  if (meta(driver, REFRESHING) === null) return { changed: [] };
  return inTransaction(driver, () => {
    const tracker = new ChangeTracker(driver);
    const lost = driver.all(
      "SELECT s.entity, s.entity_id FROM entity_snapshot s WHERE s.source = 'server' " +
        "AND s.version < 0 AND NOT EXISTS (SELECT 1 FROM outbox o WHERE o.entity = s.entity " +
        "AND o.entity_id = s.entity_id AND o.status = 'pending')",
    );
    for (const row of lost) {
      const ref = { entity: String(row.entity), entityId: String(row.entity_id) };
      tracker.touch(ref);
      driver.run(
        "DELETE FROM entity_snapshot WHERE entity = ? AND entity_id = ? AND source = 'server'",
        [ref.entity, ref.entityId],
      );
    }
    const [left] = driver.all(
      "SELECT count(*) AS n FROM entity_snapshot WHERE source = 'server' AND version < 0",
    );
    if (Number(left?.n ?? 0) === 0) driver.run("DELETE FROM sync_meta WHERE key = ?", [REFRESHING]);
    return { changed: tracker.changed() };
  });
}

/** What is left of the last rebase: commands still to resend, and those beyond recovery. */
export function readRestoreState(driver: SqliteDriver) {
  const through = Number(meta(driver, RESEND_THROUGH) ?? 0);
  const [row] = driver.all(
    "SELECT count(*) AS n FROM outbox WHERE status = 'pending' AND device_seq <= ?",
    [through],
  );
  return {
    resending: Number(row?.n ?? 0),
    unrecoverable: Number(meta(driver, UNRECOVERABLE) ?? 0),
  };
}
