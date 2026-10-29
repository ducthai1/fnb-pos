import type { ClientErrorReport } from "@fnb/contracts";
import { describe, expect, it, vi } from "vitest";
import type { ApiResult } from "../api/api-result";
import {
  DEDUPE_WINDOW_MS,
  MAX_REPORT_AGE_MS,
  QUEUE_CAP,
  createBackofficeReporter,
} from "./backoffice-reporter";

const sentOk: ApiResult<true> = { ok: true, value: true };
const failed = (status: number | null): ApiResult<true> => ({
  ok: false,
  status,
  code: null,
  body: null,
});

function setup(answer: ApiResult<true> = sentOk) {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
  let nowMs = Date.parse("2026-10-29T10:00:00Z");
  const send = vi.fn(async (reports: readonly ClientErrorReport[]): Promise<ApiResult<true>> =>
    reports.length >= 0 ? answer : sentOk,
  );
  const reporter = createBackofficeReporter({
    storage,
    send,
    appVersion: "0.0.0+abc",
    now: () => nowMs,
    route: () => "/menu",
  });
  const stored = (): ClientErrorReport[] =>
    JSON.parse(data.get("fnb.backoffice.client-errors") ?? "[]");
  return {
    reporter,
    send,
    stored,
    advance: (ms: number) => {
      nowMs += ms;
    },
  };
}

describe("the backoffice's fault reports", () => {
  it("keeps a fault raised before sign-in and sends it once someone is signed in", async () => {
    const t = setup();
    t.reporter.capture({ kind: "error", error: new Error("on the login page") });
    await t.reporter.flush();
    expect(t.send).not.toHaveBeenCalled();
    t.reporter.setSignedIn(true);
    await t.reporter.flush();
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.send.mock.calls[0]?.[0]).toMatchObject([
      { app: "backoffice", kind: "error", message: "on the login page", route: "/menu" },
    ]);
    expect(t.stored()).toEqual([]);
  });

  it("sends a fault at once while signed in, and counts a repeat within a minute once", async () => {
    const t = setup();
    t.reporter.setSignedIn(true);
    const loop = new Error("loop");
    t.reporter.capture({ kind: "render", error: loop });
    t.reporter.capture({ kind: "render", error: loop });
    await t.reporter.flush();
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.send.mock.calls[0]?.[0]).toHaveLength(1);
    t.advance(DEDUPE_WINDOW_MS + 1);
    t.reporter.capture({ kind: "render", error: loop });
    await t.reporter.flush();
    expect(t.send).toHaveBeenCalledTimes(2);
  });

  it("keeps what the server did not take, and drops what it refuses for good", async () => {
    for (const status of [null, 401, 429, 503]) {
      const t = setup(failed(status));
      t.reporter.setSignedIn(true);
      t.reporter.capture({ kind: "error", error: new Error("later") });
      await t.reporter.flush();
      expect(t.stored()).toHaveLength(1);
    }
    const refused = setup(failed(400));
    refused.reporter.setSignedIn(true);
    refused.reporter.capture({ kind: "error", error: new Error("bad") });
    await refused.reporter.flush();
    expect(refused.stored()).toEqual([]);
  });

  it("keeps at most 50 and nothing older than a day", async () => {
    const t = setup();
    for (let i = 0; i < QUEUE_CAP + 3; i += 1) {
      t.reporter.capture({ kind: "error", error: new Error(`fault ${i}`) });
    }
    expect(t.stored()).toHaveLength(QUEUE_CAP);
    t.advance(MAX_REPORT_AGE_MS + 1);
    t.reporter.capture({ kind: "error", error: new Error("fresh") });
    expect(t.stored().map((r) => r.message)).toEqual(["fresh"]);
  });

  it("sends twenty at a time", async () => {
    const t = setup();
    for (let i = 0; i < 25; i += 1)
      t.reporter.capture({ kind: "error", error: new Error(`f${i}`) });
    t.reporter.setSignedIn(true);
    await t.reporter.flush();
    expect(t.send.mock.calls.map((call) => call[0].length)).toEqual([20, 5]);
  });
});
