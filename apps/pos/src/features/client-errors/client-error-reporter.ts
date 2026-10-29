import {
  CLIENT_ERROR_BATCH_MAX,
  CLIENT_ERROR_MESSAGE_MAX,
  CLIENT_ERROR_STACK_MAX_BYTES,
  type ClientErrorReport,
} from "@fnb/contracts";
import type { ClientErrorQueue } from "./client-error-queue";

/** What the server said to a batch: taken, to try again later, or refused for good. */
export type SendOutcome = "sent" | "retry" | "drop";

export type SendReports = (
  deviceToken: string,
  reports: readonly ClientErrorReport[],
) => Promise<SendOutcome>;

export interface CapturedError {
  readonly kind: ClientErrorReport["kind"];
  readonly error: unknown;
  /** The component stack a render error comes with, appended to the stack. */
  readonly extraStack?: string;
}

export interface ClientErrorReporter {
  capture(captured: CapturedError): void;
  /** The paired till's credential, once there is one (null again when the till is closed). */
  authenticate(deviceToken: string | null): void;
  /** Sends what is queued, if the till is paired; one send at a time. */
  flush(): Promise<void>;
}

export interface ReporterOptions {
  queue: ClientErrorQueue;
  send: SendReports;
  appVersion: string;
  now(): number;
  /** The screen the till is on, without a query string. */
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

export function createClientErrorReporter(options: ReporterOptions): ClientErrorReporter {
  let token: string | null = null;
  let running: Promise<void> | null = null;

  // See the backoffice's reporter: a flush with nothing to send is over before its caller
  // continues, and one during a send is picked up by that send's next round.
  async function flush(): Promise<void> {
    if (running !== null) return running;
    const deviceToken = token;
    if (deviceToken === null || options.queue.pending().length === 0) return;
    const round = (async () => {
      try {
        for (;;) {
          const batch = options.queue.pending().slice(0, CLIENT_ERROR_BATCH_MAX);
          if (batch.length === 0 || token !== deviceToken) return;
          const outcome = await options.send(deviceToken, batch).catch((): SendOutcome => "retry");
          if (outcome === "retry") return;
          options.queue.discard(batch.length);
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
    capture({ kind, error, extraStack }) {
      const { message, stack } = describe(error);
      const fullStack = [stack, extraStack].filter(Boolean).join("\n");
      const report: ClientErrorReport = {
        app: "pos",
        appVersion: options.appVersion,
        occurredAt: new Date(options.now()).toISOString(),
        kind,
        message: message.slice(0, CLIENT_ERROR_MESSAGE_MAX) || "(no message)",
        route: options.route(),
        ...(fullStack === "" ? {} : { stack: fullStack.slice(0, CLIENT_ERROR_STACK_MAX_BYTES) }),
      };
      options.queue.add(report);
    },
    authenticate(deviceToken) {
      token = deviceToken;
      if (deviceToken !== null) void flush();
    },
  };
}

/** Reports what the page throws outside React and what a promise rejects with unhandled. */
export function installGlobalErrorCapture(
  target: Pick<Window, "addEventListener" | "removeEventListener">,
  reporter: ClientErrorReporter,
): () => void {
  const onError = (event: ErrorEvent) =>
    reporter.capture({ kind: "error", error: event.error ?? event.message });
  const onRejection = (event: PromiseRejectionEvent) =>
    reporter.capture({ kind: "unhandled_rejection", error: event.reason });
  const onOnline = () => void reporter.flush();
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  target.addEventListener("online", onOnline);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
    target.removeEventListener("online", onOnline);
  };
}
