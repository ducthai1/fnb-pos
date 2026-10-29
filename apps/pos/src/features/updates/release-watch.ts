export const RELEASE_POLL_MS = 5 * 60_000;

/** The part of the page the watch listens to; a test passes plain event targets. */
export interface ReleaseWatchEnvironment {
  readonly window: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  readonly document: Pick<EventTarget, "addEventListener" | "removeEventListener"> & {
    readonly visibilityState: string;
  };
  fetchImpl(input: string, init: RequestInit): Promise<Response>;
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface ReleaseWatchOptions {
  /** Where version.json is served from, e.g. /pos/version.json. */
  readonly url: string;
  /** The release this page was built as. */
  readonly running: string;
  readonly intervalMs?: number;
  /** Told whenever the served release is learned: its id when it differs, else null. */
  readonly onChange: (available: string | null) => void;
  readonly environment: ReleaseWatchEnvironment;
}

function releaseIdIn(body: unknown): string | null {
  const id = (body as { releaseId?: unknown } | null)?.releaseId;
  return typeof id === "string" && id !== "" ? id : null;
}

/**
 * Asks the server which release it serves: when the page opens, every few minutes, when the
 * network returns and when the page comes back into view. Any id other than the running one
 * is an update, so a release rolled back on the server reaches the tills the same way. An
 * answer that cannot be read (offline, a proxy's error page) changes nothing.
 */
export function startReleaseWatch(options: ReleaseWatchOptions): () => void {
  const { environment: env } = options;
  let checking = false;
  let stopped = false;

  async function check() {
    if (checking || stopped) return;
    checking = true;
    try {
      const response = await env.fetchImpl(options.url, { cache: "no-store" });
      if (!response.ok) return;
      const id = releaseIdIn(await response.json());
      if (id !== null && !stopped) options.onChange(id === options.running ? null : id);
    } catch {
      // Offline or unreadable: the till keeps the release it has.
    } finally {
      checking = false;
    }
  }

  const onVisible = () => {
    if (env.document.visibilityState === "visible") void check();
  };
  const onOnline = () => void check();
  env.window.addEventListener("online", onOnline);
  env.document.addEventListener("visibilitychange", onVisible);
  const timer = env.setInterval(() => void check(), options.intervalMs ?? RELEASE_POLL_MS);
  void check();
  return () => {
    stopped = true;
    env.window.removeEventListener("online", onOnline);
    env.document.removeEventListener("visibilitychange", onVisible);
    env.clearInterval(timer);
  };
}

/** The watch on the real page. */
export const browserReleaseEnvironment = (): ReleaseWatchEnvironment => ({
  window,
  document,
  fetchImpl: (input, init) => fetch(input, init),
  setInterval: (callback, ms) => window.setInterval(callback, ms),
  clearInterval: (handle) => window.clearInterval(handle as number),
});

/** What the till is given to learn of updates: subscribe, get told, unsubscribe. */
export interface UpdateSource {
  subscribe(onChange: (available: string | null) => void): () => void;
}

export function releaseUpdateSource(running: string, baseUrl: string): UpdateSource {
  return {
    subscribe: (onChange) =>
      startReleaseWatch({
        url: `${baseUrl}version.json`,
        running,
        onChange,
        environment: browserReleaseEnvironment(),
      }),
  };
}
