import type { ClientErrorReport } from "@fnb/contracts";

/** Reports kept on the till at most; the oldest go first, so a loop cannot fill the disk. */
export const QUEUE_CAP = 50;
/** The same fault again within this long is counted once. */
export const DEDUPE_WINDOW_MS = 60_000;
/** A report older than this is not worth the server's attention any more. */
export const MAX_REPORT_AGE_MS = 24 * 60 * 60_000;

/** Where the queue survives a page load; a failing store only costs the persistence. */
export interface ReportStorage {
  load(): ClientErrorReport[];
  save(reports: ClientErrorReport[]): void;
}

const fingerprintOf = (report: ClientErrorReport) =>
  `${report.app}|${report.kind}|${report.message}|${(report.stack ?? "").split("\n", 2).join("\n")}`;

/**
 * The faults waiting to be sent: kept in the browser's storage (a fault raised before the
 * till is paired, or offline, is sent once it can be), bounded in number and in age, and
 * deduplicated so one fault firing in a loop is one report.
 */
export class ClientErrorQueue {
  private readonly lastSeen = new Map<string, number>();

  constructor(
    private readonly storage: ReportStorage,
    private readonly now: () => number,
  ) {}

  /** Keeps `report` unless the same fault was reported a moment ago; says whether it did. */
  add(report: ClientErrorReport): boolean {
    const key = fingerprintOf(report);
    const at = this.now();
    const seen = this.lastSeen.get(key);
    if (seen !== undefined && at - seen < DEDUPE_WINDOW_MS) return false;
    this.lastSeen.set(key, at);
    for (const [other, when] of this.lastSeen) {
      if (at - when >= DEDUPE_WINDOW_MS) this.lastSeen.delete(other);
    }
    this.storage.save([...this.pending(), report].slice(-QUEUE_CAP));
    return true;
  }

  /** The reports still worth sending, oldest first. */
  pending(): ClientErrorReport[] {
    const oldest = this.now() - MAX_REPORT_AGE_MS;
    const all = this.storage.load();
    const fresh = all.filter((report) => Date.parse(report.occurredAt) >= oldest);
    if (fresh.length !== all.length) this.storage.save(fresh);
    return fresh;
  }

  /** Forgets the first `count` pending reports, once they were sent or refused for good. */
  discard(count: number): void {
    this.storage.save(this.pending().slice(count));
  }
}

const KEY = "fnb.pos.client-errors";

/** The queue's storage in `storage` (localStorage); unreadable or full storage reads as empty. */
export function webReportStorage(storage: Storage): ReportStorage {
  return {
    load() {
      try {
        const parsed: unknown = JSON.parse(storage.getItem(KEY) ?? "[]");
        return Array.isArray(parsed) ? (parsed as ClientErrorReport[]) : [];
      } catch {
        return [];
      }
    },
    save(reports) {
      try {
        storage.setItem(KEY, JSON.stringify(reports));
      } catch {
        // Storage full or blocked: the report is lost, the till keeps selling.
      }
    },
  };
}
