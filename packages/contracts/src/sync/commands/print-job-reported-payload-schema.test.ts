import { describe, expect, it } from "vitest";
import { outcomeOf, refusedPathsOf } from "../../zod-issue-test-helpers";
import { printJobReportedPayloadSchema } from "./print-job-reported-payload-schema";

const id = (n: number) => `0192f5a4-7c3e-7d10-8b2a-${String(n).padStart(12, "0")}`;
const report = (more: object = {}) => ({
  jobId: id(1),
  kind: "bill",
  status: "failed",
  attempts: 3,
  printerKey: "counter",
  orderId: id(2),
  errorCode: "paper_out",
  occurredAt: "2026-10-20T08:15:00.000+07:00",
  ...more,
});

describe("printJobReportedPayloadSchema", () => {
  it.each([
    ["a failed bill with its error", report()],
    ["a printed bill with no error", report({ status: "printed", errorCode: undefined })],
    [
      "a shift report naming its shift",
      report({ kind: "shift_report", orderId: undefined, shiftId: id(3) }),
    ],
    ["a cup label of an order", report({ kind: "cup_label" })],
  ])("takes %s", (_label, sent) => {
    expect(outcomeOf(printJobReportedPayloadSchema, sent).ok).toBe(true);
  });

  it.each([
    ["a failure that does not say why", report({ errorCode: undefined }), "errorCode"],
    ["a printed job carrying an error", report({ status: "printed" }), "errorCode"],
    ["a slip that names no order", report({ orderId: undefined }), "orderId"],
    ["a shift report that names no shift", report({ kind: "shift_report" }), "shiftId"],
    ["a job never tried", report({ attempts: 0 }), "attempts"],
    ["a kind the till cannot print", report({ kind: "receipt" }), "kind"],
    ["a moment with no offset", report({ occurredAt: "2026-10-20T08:15:00" }), "occurredAt"],
    ["a blank printer", report({ printerKey: "  " }), "printerKey"],
  ])("refuses %s", (_label, sent, path) => {
    expect(refusedPathsOf(printJobReportedPayloadSchema, sent)).toContain(path);
  });
});
