import type { SyncReport } from "@fnb/sync-client";
import { describe, expect, it } from "vitest";
import { connectionAfter } from "./till-sync-status";

const emptyReport = (): SyncReport => ({
  accepted: [],
  rejected: [],
  retried: 0,
  pulled: 0,
  caughtUp: false,
  pending: 0,
  restore: null,
  failure: null,
});

const failing = (failure: NonNullable<SyncReport["failure"]>): SyncReport => ({
  ...emptyReport(),
  failure,
});

describe("what a sync pass says of the till's link", () => {
  it("is online when the pass went through and offline when nothing answered", () => {
    expect(connectionAfter(emptyReport())).toBe("online");
    expect(connectionAfter(failing({ stage: "pull", kind: "network" }))).toBe("offline");
  });

  it("tells a server below its minimum build from any other error by status and code", () => {
    const tooOld = { stage: "push", kind: "http", status: 426, code: "API_POS_RELEASE_TOO_OLD" } as const;
    expect(connectionAfter(failing(tooOld))).toBe("update_required");
    expect(connectionAfter(failing({ ...tooOld, stage: "pull" }))).toBe("update_required");
    expect(connectionAfter(failing({ stage: "push", kind: "http", status: 426 }))).toBe(
      "server_error",
    );
    expect(connectionAfter(failing({ stage: "push", kind: "http", status: 502 }))).toBe(
      "server_error",
    );
  });
});
