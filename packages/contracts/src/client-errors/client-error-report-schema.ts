import { z } from "zod";

/** The most reports one request may carry. */
export const CLIENT_ERROR_BATCH_MAX = 20;
/** What the server keeps of a message and of a stack, in characters and bytes. */
export const CLIENT_ERROR_MESSAGE_MAX = 500;
export const CLIENT_ERROR_STACK_MAX_BYTES = 4096;

export const CLIENT_ERROR_APPS = ["pos", "backoffice"] as const;
export const CLIENT_ERROR_KINDS = ["error", "unhandled_rejection", "render"] as const;

/**
 * One fault a screen hit. The bounds here only refuse a request that is absurd; the
 * client trims to the real caps before sending, and the server trims again, so an old
 * client with looser caps is still taken.
 */
export const clientErrorReportSchema = z.object({
  app: z.enum(CLIENT_ERROR_APPS),
  appVersion: z.string().min(1).max(64),
  occurredAt: z.string().datetime({ offset: true }),
  kind: z.enum(CLIENT_ERROR_KINDS),
  message: z.string().max(10_000),
  stack: z.string().max(100_000).optional(),
  route: z.string().max(2_000).optional(),
});

export const clientErrorBatchSchema = z.object({
  reports: z.array(clientErrorReportSchema).min(1).max(CLIENT_ERROR_BATCH_MAX),
});

export type ClientErrorReport = z.infer<typeof clientErrorReportSchema>;
export type ClientErrorBatch = z.infer<typeof clientErrorBatchSchema>;
