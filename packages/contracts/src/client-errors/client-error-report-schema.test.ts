import { describe, expect, it } from "vitest";
import { CLIENT_ERROR_BATCH_MAX, clientErrorBatchSchema } from "./client-error-report-schema";

const report = {
  app: "pos",
  appVersion: "0.1.0+abc1234",
  occurredAt: "2026-10-29T10:00:00.000Z",
  kind: "error",
  message: "boom",
};

describe("the client error batch", () => {
  it("takes one report and one with every optional field", () => {
    expect(clientErrorBatchSchema.safeParse({ reports: [report] }).success).toBe(true);
    const full = { ...report, stack: "Error: boom\n at x", route: "/orders/1" };
    expect(clientErrorBatchSchema.safeParse({ reports: [full] }).success).toBe(true);
  });

  it("refuses an empty batch and one over the limit", () => {
    expect(clientErrorBatchSchema.safeParse({ reports: [] }).success).toBe(false);
    const many = Array.from({ length: CLIENT_ERROR_BATCH_MAX + 1 }, () => report);
    expect(clientErrorBatchSchema.safeParse({ reports: many }).success).toBe(false);
  });

  it("refuses an unknown app or kind and a time that is not a timestamp", () => {
    for (const bad of [{ app: "kds" }, { kind: "warning" }, { occurredAt: "yesterday" }]) {
      expect(clientErrorBatchSchema.safeParse({ reports: [{ ...report, ...bad }] }).success).toBe(
        false,
      );
    }
  });
});
