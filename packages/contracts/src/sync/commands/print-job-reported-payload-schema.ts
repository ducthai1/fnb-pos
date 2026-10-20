import { z } from "zod";
import { instantSchema } from "../../primitives/instant-schema";
import { uuidSchema } from "../../primitives/uuid-schema";

/** What a till prints; every kind but the shift report is a slip of one order. */
export const printJobKindSchema = z.enum([
  "bill",
  "cup_label",
  "kitchen",
  "shift_report",
  "pre_bill",
]);

export type PrintJobKind = z.infer<typeof printJobKindSchema>;

const shortText = z.string().trim().min(1).max(100);

/**
 * print.job_reported: how one print job came out on the till, once it stopped retrying it.
 * The job id is the till's and stays the same across retries, so a job reported failed and
 * later printed is one job. A failure says why (the printer's error), a printed job says
 * nothing. A slip is about the order (or for a shift report, the shift) it was printed
 * for, so the report names it: a failure nobody can trace to a bill helps no manager.
 */
export const printJobReportedPayloadSchema = z
  .object({
    jobId: uuidSchema,
    kind: printJobKindSchema,
    status: z.enum(["printed", "failed"]),
    attempts: z.number().int().min(1).max(1000),
    /** The printer the till sent the job to, as its own settings name it. */
    printerKey: shortText,
    orderId: uuidSchema.optional(),
    shiftId: uuidSchema.optional(),
    errorCode: shortText.optional(),
    /** On the till's clock: when the job came out, or when the till gave up on it. */
    occurredAt: instantSchema,
  })
  .superRefine((report, context) => {
    const issue = (path: string, message: string) =>
      context.addIssue({ code: z.ZodIssueCode.custom, message, path: [path] });
    if ((report.status === "failed") !== (report.errorCode !== undefined)) {
      issue("errorCode", "a failed job says why, and only a failed one");
    }
    if (report.kind === "shift_report" && report.shiftId === undefined) {
      issue("shiftId", "a shift report names its shift");
    }
    if (report.kind !== "shift_report" && report.orderId === undefined) {
      issue("orderId", "a slip names the order it was printed for");
    }
  });

export type PrintJobReportedPayload = z.infer<typeof printJobReportedPayloadSchema>;
