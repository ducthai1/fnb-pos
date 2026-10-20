import type EmbeddedPostgres from "embedded-postgres";

// embedded-postgres installs async-exit-hook as soon as it is imported. Its `beforeExit`
// and pm2 `message` handlers call process.exit(0), which overrides the exit code vitest
// sets for failed tests: a red integration run would exit 0 and pass CI. Its `exit` handler
// then calls the server's async stop hook without a callback and crashes the process.
// All three are removed (the caller stops the server).
const FORCED_EXIT_EVENTS: readonly string[] = ["beforeExit", "message", "exit"];

// Its signal handlers stop the server and then exit at once. A test run keeps them, so
// Ctrl-C still stops its Postgres. A process that starts other processes removes them: it
// must stop its children first, and an exit in the middle would leave them orphaned.
const SIGNAL_EVENTS: readonly string[] = ["SIGHUP", "SIGINT", "SIGTERM", "SIGBREAK"];

type Listener = (...args: unknown[]) => void;
// Viewed as a plain emitter: `process` typings only overload `listeners` per known event.
const emitter: NodeJS.EventEmitter = process;

export interface LoadOptions {
  /** "remove" when the caller handles SIGINT/SIGTERM itself. */
  readonly signalHandlers?: "keep" | "remove";
}

export async function loadEmbeddedPostgres(
  options: LoadOptions = {},
): Promise<typeof EmbeddedPostgres> {
  const events = [
    ...FORCED_EXIT_EVENTS,
    ...(options.signalHandlers === "remove" ? SIGNAL_EVENTS : []),
  ];
  const before = new Map(events.map((event) => [event, emitter.listeners(event)]));
  const loaded = await import("embedded-postgres");
  for (const event of events) {
    const existing = before.get(event) ?? [];
    for (const listener of emitter.listeners(event)) {
      if (!existing.includes(listener)) emitter.removeListener(event, listener as Listener);
    }
  }
  return loaded.default;
}
