import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RELEASE_POLL_MS, startReleaseWatch } from "./release-watch";

function setup(running = "1.0.0+aaa") {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  let served: Response | Error = Response.json({ releaseId: running });
  const fetchImpl = vi.fn(async () => {
    if (served instanceof Error) throw served;
    return served.clone();
  });
  const seen: Array<string | null> = [];
  const stop = startReleaseWatch({
    url: "/pos/version.json",
    running,
    onChange: (available) => seen.push(available),
    environment: {
      window: win,
      document: doc,
      fetchImpl,
      setInterval: (cb, ms) => setInterval(cb, ms),
      clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
    },
  });
  return {
    win,
    doc,
    fetchImpl,
    seen,
    stop,
    serve: (next: Response | Error) => {
      served = next;
    },
  };
}

describe("watching the served release", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("asks at start without the cache, and reports no update while the ids match", async () => {
    const w = setup();
    await vi.advanceTimersByTimeAsync(0);
    expect(w.fetchImpl).toHaveBeenCalledWith("/pos/version.json", { cache: "no-store" });
    expect(w.seen).toEqual([null]);
    w.stop();
  });

  it("asks again every few minutes, and any different id is an update (older too)", async () => {
    const w = setup("2.0.0+bbb");
    await vi.advanceTimersByTimeAsync(0);
    w.serve(Response.json({ releaseId: "1.9.0+old" }));
    await vi.advanceTimersByTimeAsync(RELEASE_POLL_MS);
    expect(w.seen).toEqual([null, "1.9.0+old"]);
    w.serve(Response.json({ releaseId: "2.0.0+bbb" }));
    await vi.advanceTimersByTimeAsync(RELEASE_POLL_MS);
    expect(w.seen.at(-1)).toBeNull();
    w.stop();
  });

  it("asks when the network returns and when the page comes back into view, not when hidden", async () => {
    const w = setup();
    await vi.advanceTimersByTimeAsync(0);
    w.win.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(w.fetchImpl).toHaveBeenCalledTimes(2);
    w.doc.visibilityState = "hidden";
    w.doc.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(w.fetchImpl).toHaveBeenCalledTimes(2);
    w.doc.visibilityState = "visible";
    w.doc.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(w.fetchImpl).toHaveBeenCalledTimes(3);
    w.stop();
  });

  it("changes nothing when the answer is missing, an error page or not a release", async () => {
    const w = setup();
    await vi.advanceTimersByTimeAsync(0);
    for (const bad of [
      new TypeError("offline"),
      new Response("bad gateway", { status: 502 }),
      new Response("<html>", { status: 200 }),
      Response.json({ other: 1 }),
    ]) {
      w.serve(bad);
      w.win.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(w.seen).toEqual([null]);
    w.stop();
  });

  it("stops asking once stopped", async () => {
    const w = setup();
    await vi.advanceTimersByTimeAsync(0);
    w.stop();
    await vi.advanceTimersByTimeAsync(RELEASE_POLL_MS * 2);
    w.win.dispatchEvent(new Event("online"));
    expect(w.fetchImpl).toHaveBeenCalledTimes(1);
  });
});
