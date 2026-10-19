import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LocalCommand } from "./local-store";
import type { SqliteDriver } from "./sqlite-driver";

// Under the package, not the OS temp dir: /tmp is often tmpfs, where fsync is free and any
// timing of a FULL-synchronous write would look ~30 times better than on a till's disk.
const TMP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../tmp");

/** A fresh directory for database files; remove() deletes it with everything inside. */
export function scratchDirectory(label: string) {
  const path = join(TMP_ROOT, `${label}-${randomUUID()}`);
  mkdirSync(path, { recursive: true });
  return { path, remove: () => rmSync(path, { recursive: true, force: true }) };
}

/**
 * The driver, except that a statement matching `failWhen` throws once `armed` is set: the
 * way a full disk or a crash in the middle of a write looks to the store.
 */
export function faultyDriver(inner: SqliteDriver, failWhen: (sql: string) => boolean) {
  const control = { armed: false };
  const check = (sql: string) => {
    if (control.armed && failWhen(sql)) throw new Error(`injected failure on: ${sql}`);
  };
  const driver: SqliteDriver = {
    exec: (sql) => inner.exec(sql),
    run: (sql, params) => (check(sql), inner.run(sql, params)),
    all: (sql, params) => (check(sql), inner.all(sql, params)),
    close: () => inner.close(),
  };
  return { driver, control };
}

let counter = 0;
const hex = (n: number, width: number) => n.toString(16).padStart(width, "0");

/** A well-formed lowercase uuid, unique within the test run. */
export function testId(): string {
  counter += 1;
  return `0199f000-0000-7000-8000-${hex(counter, 12)}`;
}

/** An order command as a POS would record it, with its expected order row. */
export function orderCommand(orderId: string, overrides: Partial<LocalCommand> = {}): LocalCommand {
  return {
    commandId: testId(),
    type: "order.save_draft",
    payload: { orderId },
    businessDate: "2026-10-20",
    domainVersion: "0.1.0",
    createdAt: "2026-10-20T03:00:00.000Z",
    target: { entity: "order", entityId: orderId, optimistic: { id: orderId, version: 1 } },
    ...overrides,
  };
}
