import type { OrderSnapshot } from "../shared/order-rows";
import { lineFromWire, orderFromWire } from "../shared/order-wire-codec";
import { SyncError } from "../shared/sync-error";
import { SYNC_ERROR_CODES } from "../shared/sync-error-codes";
import type { ChangeWire } from "../shared/sync-wire-types";
import type { CommandDraft, LocalStore, OutboxEntry } from "./local-store";
import { lineFromSql, lineParams, numberOf, orderFromSql, orderParams } from "./local-row-mapping";
import * as sql from "./local-store-schema-sql";
import type { SqliteDriver } from "./sqlite-driver";

/** One LocalStore for every engine; only the driver underneath differs. */
export function createSqliteLocalStore(driver: SqliteDriver): LocalStore {
  driver.exec(sql.LOCAL_SCHEMA_SQL);

  // BEGIN IMMEDIATE takes the write lock up front, so a second connection (another tab, a
  // background task) fails fast instead of deadlocking on lock upgrade mid-transaction.
  const inTransaction = <T>(work: () => T): T => {
    driver.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      driver.exec("COMMIT");
      return result;
    } catch (error) {
      driver.exec("ROLLBACK");
      throw error;
    }
  };

  const readCursor = (): string => {
    const value = driver.all(sql.READ_CURSOR_SQL)[0]?.["value"];
    return typeof value === "string" ? value : "0";
  };

  const replaceOrder = (orderId: string, snapshot: OrderSnapshot | null): void => {
    driver.run(sql.DELETE_ORDER_LINES_SQL, [orderId]);
    if (snapshot === null) {
      driver.run(sql.DELETE_ORDER_SQL, [orderId]);
      return;
    }
    driver.run(sql.UPSERT_ORDER_SQL, orderParams(snapshot.order));
    for (const line of snapshot.lines) driver.run(sql.UPSERT_LINE_SQL, lineParams(line));
  };

  const applyChange = (change: ChangeWire): void => {
    if (change.entity === "order") {
      driver.run(sql.UPSERT_ORDER_SQL, orderParams(orderFromWire(change.data)));
    } else {
      driver.run(sql.UPSERT_LINE_SQL, lineParams(lineFromWire(change.data)));
    }
  };

  const readSnapshot = (orderId: string): OrderSnapshot | null => {
    const row = driver.all(sql.SELECT_ORDER_SQL, [orderId])[0];
    if (row === undefined) return null;
    const lines = driver.all(sql.SELECT_ORDER_LINES_SQL, [orderId]).map(lineFromSql);
    return { order: orderFromSql(row), lines };
  };

  return {
    async writeWithCommand(write, command: CommandDraft): Promise<OutboxEntry> {
      return inTransaction(() => {
        for (const order of write.orders) driver.run(sql.UPSERT_ORDER_SQL, orderParams(order));
        for (const line of write.lines) driver.run(sql.UPSERT_LINE_SQL, lineParams(line));
        if (driver.all(sql.FIND_QUEUED_COMMAND_SQL, [command.commandId]).length > 0) {
          throw new SyncError(
            SYNC_ERROR_CODES.commandAlreadyQueued,
            `command ${command.commandId} is already in the outbox`,
          );
        }
        driver.run(sql.INSERT_OUTBOX_SQL, [
          command.commandId,
          command.type,
          JSON.stringify(command.payload),
          command.createdAt,
        ]);
        const seqRow = driver.all(sql.FIND_QUEUED_COMMAND_SQL, [command.commandId])[0];
        return { ...command, deviceSeq: numberOf(seqRow, "device_seq") };
      });
    },

    async readPendingCommands(limit) {
      return driver.all(sql.READ_PENDING_SQL, [limit]).map(
        (row) =>
          ({
            commandId: String(row["command_id"]),
            deviceSeq: numberOf(row, "device_seq"),
            type: String(row["type"]),
            payload: JSON.parse(String(row["payload"])) as unknown,
            createdAt: numberOf(row, "created_at"),
          }) as OutboxEntry,
      );
    },

    async markAccepted(commandIds) {
      inTransaction(() => {
        for (const id of commandIds) driver.run(sql.MARK_ACCEPTED_SQL, [id]);
      });
    },

    async markRejected(rejection) {
      inTransaction(() => {
        driver.run(sql.MARK_REJECTED_SQL, [rejection.code, rejection.commandId]);
        replaceOrder(rejection.orderId, rejection.snapshot);
      });
    },

    async applyPulledChanges(changes, nextCursor) {
      return inTransaction(() => {
        // Pulled rows would overwrite optimistic local rows whose commands the server has
        // not seen yet; the page is applied only once the outbox is drained.
        if (numberOf(driver.all(sql.COUNT_PENDING_SQL)[0], "n") > 0) {
          return "deferred-pending-commands" as const;
        }
        const current = BigInt(readCursor());
        if (BigInt(nextCursor) < current) {
          throw new SyncError(
            SYNC_ERROR_CODES.cursorWentBackwards,
            `pull would move the cursor from ${current} back to ${nextCursor}`,
          );
        }
        for (const change of changes) {
          if (BigInt(change.change_seq) > current) applyChange(change);
        }
        driver.run(sql.WRITE_CURSOR_SQL, [nextCursor]);
        return "applied" as const;
      });
    },

    async readCursor() {
      return readCursor();
    },

    async readOrderSnapshot(orderId) {
      return readSnapshot(orderId);
    },

    async listOrderSnapshots() {
      const linesByOrder = new Map<string, OrderSnapshot["lines"]>();
      for (const line of driver.all(sql.SELECT_ALL_LINES_SQL).map(lineFromSql)) {
        const list = linesByOrder.get(line.orderId) ?? [];
        list.push(line);
        linesByOrder.set(line.orderId, list);
      }
      return driver.all(sql.SELECT_ALL_ORDERS_SQL).map((row) => {
        const order = orderFromSql(row);
        return { order, lines: linesByOrder.get(order.id) ?? [] };
      });
    },

    async countCommands() {
      const counts = { pending: 0, accepted: 0, rejected: 0 };
      for (const row of driver.all(sql.COUNT_BY_STATUS_SQL)) {
        const status = String(row["status"]) as keyof typeof counts;
        counts[status] = numberOf(row, "n");
      }
      return counts;
    },

    async readDatabaseSizeBytes() {
      const pages = numberOf(driver.all("PRAGMA page_count")[0], "page_count");
      return pages * numberOf(driver.all("PRAGMA page_size")[0], "page_size");
    },

    async readJournalMode() {
      return String(driver.all("PRAGMA journal_mode")[0]?.["journal_mode"]);
    },

    async close() {
      driver.close();
    },
  };
}
