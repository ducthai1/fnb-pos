import { DOMAIN_VERSION } from "@fnb/domain";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { outcomeOf, refusedPathsOf } from "../zod-issue-test-helpers";
import { syncCommandEnvelopeSchema } from "./sync-command-envelope-schema";

const envelope = {
  commandId: "0192f5a4-7c3e-7d10-8b2a-3f9e1c4d5a6b",
  deviceSeq: 1,
  type: "order.add_line",
  payload: { orderId: "0192f5a4-7c3e-7d10-8b2a-000000000001", quantity: "1.5" },
  businessDate: "2026-10-20",
  domainVersion: DOMAIN_VERSION,
  createdAt: "2026-10-20T08:15:00.000+07:00",
};

describe("syncCommandEnvelopeSchema", () => {
  it("accepts a command as a till records it, with and without staff and approval", () => {
    expect(syncCommandEnvelopeSchema.parse(envelope)).toEqual(envelope);
    const approved = {
      ...envelope,
      staffSessionId: "0192f5a4-7c3e-7d10-8b2a-000000000002",
      approvalId: "0192f5a4-7c3e-7d10-8b2a-000000000003",
    };
    expect(syncCommandEnvelopeSchema.parse(approved)).toEqual(approved);
  });

  it.each([
    ["commandId", { commandId: "0192F5A4-7C3E-7D10-8B2A-3F9E1C4D5A6B" }],
    ["deviceSeq", { deviceSeq: 0 }],
    ["deviceSeq", { deviceSeq: -3 }],
    ["deviceSeq", { deviceSeq: 1.5 }],
    ["deviceSeq", { deviceSeq: "1" }],
    ["deviceSeq", { deviceSeq: Number.MAX_SAFE_INTEGER + 1 }],
    ["type", { type: "" }],
    ["type", { type: "Order.AddLine" }],
    ["type", { type: "order..add_line" }],
    ["type", { type: "order.add line" }],
    ["payload", { payload: null }],
    ["payload", { payload: ["line"] }],
    ["staffSessionId", { staffSessionId: "staff-7" }],
    ["approvalId", { approvalId: null }],
    ["businessDate", { businessDate: "2026-02-29" }],
    ["domainVersion", { domainVersion: "" }],
    ["createdAt", { createdAt: "2026-10-20 08:15" }],
    ["createdAt", { createdAt: "2026-10-20T08:15:00" }],
  ])("refuses a command whose %s is %j", (field, change) => {
    expect(refusedPathsOf(syncCommandEnvelopeSchema, { ...envelope, ...change })).toEqual([field]);
  });

  it.each([
    "commandId",
    "deviceSeq",
    "type",
    "payload",
    "businessDate",
    "domainVersion",
    "createdAt",
  ])("refuses a command without %s", (field) => {
    const rest = Object.fromEntries(Object.entries(envelope).filter(([key]) => key !== field));
    expect(refusedPathsOf(syncCommandEnvelopeSchema, rest)).toEqual([field]);
  });

  it("refuses a field it does not know, such as a device id the till could forge", () => {
    expect(
      outcomeOf(syncCommandEnvelopeSchema, { ...envelope, deviceId: envelope.commandId }),
    ).toEqual({ ok: false, issues: [expect.objectContaining({ code: "unrecognized_keys" })] });
  });

  it("leaves a malformed domain version to the version policy instead of refusing the shape", () => {
    expect(outcomeOf(syncCommandEnvelopeSchema, { ...envelope, domainVersion: "v0.1" }).ok).toBe(
      true,
    );
  });

  it("carries every device sequence number from 1 up exactly", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }), (deviceSeq) => {
        const sent = JSON.parse(JSON.stringify({ ...envelope, deviceSeq })) as unknown;
        expect(syncCommandEnvelopeSchema.parse(sent).deviceSeq).toBe(deviceSeq);
      }),
    );
  });
});
