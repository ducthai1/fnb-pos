import { describe, expect, it } from "vitest";
import { outcomeOf } from "../zod-issue-test-helpers";
import { syncCommandResultSchema } from "./sync-command-result-schema";

const commandId = "0192f5a4-7c3e-7d10-8b2a-3f9e1c4d5a6b";
const snapshot = { id: "0192f5a4-7c3e-7d10-8b2a-000000000001", status: "open", version: 3 };

describe("syncCommandResultSchema", () => {
  it.each([
    { commandId, status: "accepted" },
    { commandId, status: "accepted", snapshot },
    { commandId, status: "accepted", shiftVersion: 7 },
    { commandId, status: "rejected", code: "DOMAIN_ORDER_ALREADY_PAID" },
    { commandId, status: "rejected", code: "API_TABLE_TAKEN", snapshot },
    { commandId, status: "retry" },
    { commandId, status: "retry", code: "API_SYNC_SEQUENCE_GAP" },
  ])("accepts the answer %j", (result) => {
    expect(syncCommandResultSchema.parse(result)).toEqual(result);
  });

  it("refuses a rejection without a code, which would leave the cashier with no reason", () => {
    expect(outcomeOf(syncCommandResultSchema, { commandId, status: "rejected" }).ok).toBe(false);
  });

  it.each([
    ["an unknown status", { commandId, status: "pending" }],
    ["a code in prose", { commandId, status: "rejected", code: "already paid" }],
    ["a code in lowercase", { commandId, status: "rejected", code: "domain_order_already_paid" }],
    ["a snapshot on a retry", { commandId, status: "retry", snapshot }],
    ["a snapshot that is not a row", { commandId, status: "accepted", snapshot: [snapshot] }],
    ["an uppercase command id", { commandId: commandId.toUpperCase(), status: "accepted" }],
    ["no command id", { status: "accepted" }],
    ["a shift version that is negative", { commandId, status: "accepted", shiftVersion: -1 }],
    ["a shift version that is not whole", { commandId, status: "accepted", shiftVersion: 1.5 }],
    ["a shift version on a rejection", { commandId, status: "rejected", code: "API_X", shiftVersion: 1 }],
  ])("refuses %s", (_label, result) => {
    expect(outcomeOf(syncCommandResultSchema, result).ok).toBe(false);
  });

  it("lets a till branch on status and read the code only where there is one", () => {
    const result = syncCommandResultSchema.parse({ commandId, status: "rejected", code: "API_X" });
    const reason = result.status === "rejected" ? result.code : null;
    expect(reason).toBe("API_X");
  });
});
