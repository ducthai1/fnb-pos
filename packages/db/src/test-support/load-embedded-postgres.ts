import type EmbeddedPostgres from "embedded-postgres";

// embedded-postgres installs async-exit-hook as soon as it is imported. Its `beforeExit`
// and pm2 `message` handlers call process.exit(0), which overrides the exit code vitest
// sets for failed tests: a red integration run would exit 0 and pass CI. Its `exit` handler
// then calls the server's async stop hook without a callback and crashes the process.
// All three are removed (the global teardown stops the server); the signal handlers stay,
// so Ctrl-C still stops it.
const FORCED_EXIT_EVENTS: readonly string[] = ["beforeExit", "message", "exit"];

type Listener = (...args: unknown[]) => void;
// Viewed as a plain emitter: `process` typings only overload `listeners` per known event.
const emitter: NodeJS.EventEmitter = process;

export async function loadEmbeddedPostgres(): Promise<typeof EmbeddedPostgres> {
  const before = new Map(FORCED_EXIT_EVENTS.map((event) => [event, emitter.listeners(event)]));
  const loaded = await import("embedded-postgres");
  for (const event of FORCED_EXIT_EVENTS) {
    const existing = before.get(event) ?? [];
    for (const listener of emitter.listeners(event)) {
      if (!existing.includes(listener)) emitter.removeListener(event, listener as Listener);
    }
  }
  return loaded.default;
}
