import {
  CLIENT_ERROR_BATCH_MAX,
  CLIENT_ERROR_MESSAGE_MAX,
  CLIENT_ERROR_STACK_MAX_BYTES,
  type ClientErrorReport,
} from "@fnb/contracts";
import type { ApiResult } from "../api/api-result";

export const QUEUE_CAP = 50;
export const DEDUPE_WINDOW_MS = 60_000;
export const MAX_REPORT_AGE_MS = 24 * 60 * 60_000;
const KEY = "fnb.backoffice.client-errors";

/** The part of sessionStorage the queue uses; a failing one only costs the persistence. */
export interface ReportStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface CapturedError {
  readonly kind: ClientErrorReport["kind"];
  readonly error: unknown;
  /** The component stack a render error comes with, appended to the stack. */
  readonly extraStack?: string;
}

export interface BackofficeReporter {
  capture(captured: CapturedError): void;
  /** Whether a member is signed in: reports wait for it, and go out when it turns true. */
  setSignedIn(signedIn: boolean): void;
  flush(): Promise<void>;
}

export interface ReporterOptions {
  storage: ReportStorage;
  send(reports: readonly ClientErrorReport[]): Promise<ApiResult<true>>;
  appVersion: string;
  now(): number;
  /** The page the member is on, without a query string. */
  route(): string;
}

function describe(error: unknown): { message: string; stack: string | undefined } {
  if (error instanceof Error) return { message: error.message || error.name, stack: error.stack };
  if (typeof error === "string") return { message: error, stack: undefined };
  try {
    return { message: JSON.stringify(error) ?? String(error), stack: undefined };
  } catch {
    return { message: String(error), stack: undefined };
  }
}

/**
 * Collects the faults a page hits and sends them to the API once a member is signed in
 * (the API takes them from a session only). Kept in the tab's session storage so a fault
 * raised on the sign-in page survives the sign-in, at most 50, a day old at most, and the
 * same fault only once a minute. A send the server refuses for good is dropped; one that
 * did not get through (offline, a fault, 401, 429) waits for the next flush.
 */
export function createBackofficeReporter(options: ReporterOptions): BackofficeReporter {
  const lastSeen = new Map<string, number>();
  let signedIn = false;
  let running: Promise<void> | null = null;

  const load = (): ClientErrorReport[] => {
    try {
      const parsed: unknown = JSON.parse(options.storage.getItem(KEY) ?? "[]");
      const oldest = options.now() - MAX_REPORT_AGE_MS;
      return Array.isArray(parsed)
        ? (parsed as ClientErrorReport[]).filter(
            (report) => Date.parse(report.occurredAt) >= oldest,
          )
        : [];
    } catch {
      return [];
    }
  };
  const save = (reports: ClientErrorReport[]) => {
    try {
      options.storage.setItem(KEY, JSON.stringify(reports));
    } catch {
      // Storage full or blocked: the report is lost, the page keeps working.
    }
  };

  // `running` is cleared inside the function itself, so a flush that finds nothing to send
  // is over by the time its caller continues; a flush during a send is picked up by that
  // send's next round, which reads the queue afresh.
  async function flush(): Promise<void> {
    if (running !== null) return running;
    if (!signedIn || load().length === 0) return;
    const round = (async () => {
      try {
        for (;;) {
          const batch = load().slice(0, CLIENT_ERROR_BATCH_MAX);
          if (batch.length === 0 || !signedIn) return;
          let result: ApiResult<true>;
          try {
            result = await options.send(batch);
          } catch {
            return;
          }
          const retry =
            !result.ok &&
            (result.status === null ||
              result.status >= 500 ||
              result.status === 401 ||
              result.status === 429);
          if (retry) return;
          save(load().slice(batch.length));
        }
      } finally {
        running = null;
      }
    })();
    running = round;
    return round;
  }

  return {
    flush,
    setSignedIn(next) {
      signedIn = next;
      if (next) void flush();
    },
    capture({ kind, error, extraStack }) {
      const { message, stack } = describe(error);
      const fullStack = [stack, extraStack].filter(Boolean).join("\n");
      const report: ClientErrorReport = {
        app: "backoffice",
        appVersion: options.appVersion,
        occurredAt: new Date(options.now()).toISOString(),
        kind,
        message: message.slice(0, CLIENT_ERROR_MESSAGE_MAX) || "(no message)",
        route: options.route(),
        ...(fullStack === "" ? {} : { stack: fullStack.slice(0, CLIENT_ERROR_STACK_MAX_BYTES) }),
      };
      const key = `${kind}|${report.message}|${(report.stack ?? "").split("\n", 2).join("\n")}`;
      const at = options.now();
      const seen = lastSeen.get(key);
      if (seen !== undefined && at - seen < DEDUPE_WINDOW_MS) return;
      lastSeen.set(key, at);
      save([...load(), report].slice(-QUEUE_CAP));
      void flush();
    },
  };
}
