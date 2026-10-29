import type { ClientErrorReport } from "@fnb/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  ClientErrorQueue,
  DEDUPE_WINDOW_MS,
  MAX_REPORT_AGE_MS,
  QUEUE_CAP,
  type ReportStorage,
} from "./client-error-queue";
import {
  type SendOutcome,
  type SendReports,
  createClientErrorReporter,
  installGlobalErrorCapture,
} from "./client-error-reporter";
import { httpSendReports } from "./client-error-sender";

function setup(outcome: SendOutcome = "sent") {
  let stored: ClientErrorReport[] = [];
  const storage: ReportStorage = {
    load: () => stored,
    save: (reports) => {
      stored = reports;
    },
  };
  let nowMs = Date.parse("2026-10-29T10:00:00Z");
  const queue = new ClientErrorQueue(storage, () => nowMs);
  const send = vi.fn<SendReports>(async () => outcome);
  const reporter = createClientErrorReporter({
    queue,
    send,
    appVersion: "0.0.0+abc",
    now: () => nowMs,
    route: () => "/pos/",
  });
  return {
    reporter,
    queue,
    send,
    stored: () => stored,
    advance: (ms: number) => {
      nowMs += ms;
    },
  };
}

describe("the till's fault reports", () => {
  it("keeps a fault raised before the till is paired and sends it once it is", async () => {
    const t = setup();
    t.reporter.capture({ kind: "error", error: new Error("boom") });
    await t.reporter.flush();
    expect(t.send).not.toHaveBeenCalled();
    t.reporter.authenticate("token-1");
    await t.reporter.flush();
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.send.mock.calls[0]).toMatchObject([
      "token-1",
      [{ app: "pos", kind: "error", message: "boom", route: "/pos/" }],
    ]);
    expect(t.stored()).toEqual([]);
  });

  it("counts one fault repeating within a minute once, and again after it", () => {
    const t = setup();
    for (let i = 0; i < 5; i += 1) t.reporter.capture({ kind: "render", error: new Error("loop") });
    expect(t.stored()).toHaveLength(1);
    t.advance(DEDUPE_WINDOW_MS + 1);
    t.reporter.capture({ kind: "render", error: new Error("loop") });
    expect(t.stored()).toHaveLength(2);
  });

  it("keeps at most 50, dropping the oldest", () => {
    const t = setup();
    for (let i = 0; i < QUEUE_CAP + 5; i += 1) {
      t.reporter.capture({ kind: "error", error: new Error(`fault ${i}`) });
    }
    expect(t.stored()).toHaveLength(QUEUE_CAP);
    expect(t.stored()[0]?.message).toBe("fault 5");
  });

  it("drops reports older than a day instead of sending them", async () => {
    const t = setup();
    t.reporter.capture({ kind: "error", error: new Error("old") });
    t.advance(MAX_REPORT_AGE_MS + 1);
    t.reporter.capture({ kind: "error", error: new Error("new") });
    t.reporter.authenticate("token-1");
    await t.reporter.flush();
    expect(t.send.mock.calls[0]?.[1]).toMatchObject([{ message: "new" }]);
  });

  it("sends in batches of twenty and keeps what the server did not take", async () => {
    const t = setup();
    for (let i = 0; i < 25; i += 1)
      t.reporter.capture({ kind: "error", error: new Error(`f${i}`) });
    t.reporter.authenticate("token-1");
    await t.reporter.flush();
    expect(t.send.mock.calls.map((call) => call[1].length)).toEqual([20, 5]);
    const failing = setup("retry");
    failing.reporter.capture({ kind: "error", error: new Error("later") });
    failing.reporter.authenticate("token-1");
    await failing.reporter.flush();
    expect(failing.stored()).toHaveLength(1);
    expect(failing.send).toHaveBeenCalledTimes(1);
  });

  it("drops a batch the server refuses for good", async () => {
    const t = setup("drop");
    t.reporter.capture({ kind: "error", error: new Error("bad") });
    t.reporter.authenticate("token-1");
    await t.reporter.flush();
    expect(t.stored()).toEqual([]);
  });

  it("trims a long message and stack before queueing", () => {
    const t = setup();
    const error = new Error("m".repeat(900));
    error.stack = "s".repeat(9_000);
    t.reporter.capture({ kind: "error", error });
    expect(t.stored()[0]?.message).toHaveLength(500);
    expect(t.stored()[0]?.stack?.length).toBeLessThanOrEqual(4096);
  });

  it("captures window errors and unhandled rejections, and flushes when back online", async () => {
    const t = setup();
    const target = new EventTarget();
    const stop = installGlobalErrorCapture(target as unknown as Window, t.reporter);
    const failure = new Event("error") as ErrorEvent;
    Object.assign(failure, { error: new Error("thrown") });
    target.dispatchEvent(failure);
    const rejection = new Event("unhandledrejection") as PromiseRejectionEvent;
    Object.assign(rejection, { reason: "no good" });
    target.dispatchEvent(rejection);
    expect(t.stored().map((r) => [r.kind, r.message])).toEqual([
      ["error", "thrown"],
      ["unhandled_rejection", "no good"],
    ]);
    t.reporter.authenticate("token-1");
    await t.reporter.flush();
    t.reporter.capture({ kind: "error", error: new Error("offline one") });
    target.dispatchEvent(new Event("online"));
    await t.reporter.flush();
    expect(t.stored()).toEqual([]);
    stop();
  });
});

describe("posting the reports", () => {
  const post = async (status: number | "network") => {
    const fetchImpl = vi.fn(async () => {
      if (status === "network") throw new TypeError("offline");
      return new Response(null, { status });
    });
    const outcome = await httpSendReports("/api", fetchImpl as unknown as typeof fetch)("tok", []);
    return { outcome, fetchImpl };
  };

  it("sends the till's credential and reads each answer for what to do next", async () => {
    const { outcome, fetchImpl } = await post(204);
    expect(outcome).toBe("sent");
    expect(fetchImpl.mock.calls[0]).toMatchObject([
      "/api/client-errors",
      { method: "POST", headers: { authorization: "Device tok" } },
    ]);
    expect((await post(429)).outcome).toBe("retry");
    expect((await post(503)).outcome).toBe("retry");
    expect((await post("network")).outcome).toBe("retry");
    expect((await post(400)).outcome).toBe("drop");
  });
});
