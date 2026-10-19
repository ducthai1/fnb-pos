import type { EntitySnapshot } from "@fnb/contracts";
import type { EntityRef, EntityView } from "./local-store";
import { READ_ENTITY_SQL } from "./local-store-schema-sql";
import type { SqliteDriver } from "./sqlite-driver";

interface SnapshotRow {
  source: "server" | "optimistic";
  version: number;
  snapshot: string | null;
}

/**
 * What the till shows for one row: its own expectation while one of its commands on the row
 * is pending (that copy exists only then), otherwise the newest copy the server sent. Null
 * when there is nothing to show: never seen, deleted on the server, or a new row the server
 * refused before ever storing it.
 */
export function readView(driver: SqliteDriver, ref: EntityRef): EntityView | null {
  const rows = driver.all(READ_ENTITY_SQL, [ref.entity, ref.entityId]) as unknown as SnapshotRow[];
  const server = rows.find((row) => row.source === "server");
  const optimistic = rows.find((row) => row.source === "optimistic");
  const serverVersion = server === undefined ? null : Number(server.version);
  const shown = optimistic ?? server;
  if (shown === undefined || shown.snapshot === null) return null;
  return {
    ...ref,
    snapshot: JSON.parse(shown.snapshot) as EntitySnapshot,
    source: shown.source,
    serverVersion,
  };
}

const keyOf = (ref: EntityRef) => `${ref.entity}\u0000${ref.entityId}`;
const fingerprint = (view: EntityView | null) =>
  view === null ? "" : `${view.source}\u0000${JSON.stringify(view.snapshot)}`;

/**
 * Notes what each touched row showed before a write, so the write can report the rows that
 * now show something else. Used inside the write's transaction.
 */
export class ChangeTracker {
  private readonly before = new Map<string, { ref: EntityRef; shown: string }>();

  constructor(private readonly driver: SqliteDriver) {}

  /** Call before changing the row; only the first call per row counts. */
  touch(ref: EntityRef): void {
    const key = keyOf(ref);
    if (this.before.has(key)) return;
    this.before.set(key, { ref, shown: fingerprint(readView(this.driver, ref)) });
  }

  changed(): EntityRef[] {
    return [...this.before.values()]
      .filter(({ ref, shown }) => fingerprint(readView(this.driver, ref)) !== shown)
      .map(({ ref }) => ({ entity: ref.entity, entityId: ref.entityId }));
  }
}
