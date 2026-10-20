import { z } from "zod";
import type { CleanupSettings } from "../ops/sign-in-cleanup-job";

const DAY_MILLIS = 24 * 60 * 60 * 1000;

/** The variables of the job that deletes expired pairing codes and sessions. */
export const cleanupEnvironment = {
  FNB_CLEANUP_ENABLED: z
    .enum(["true", "false"], { message: "must be true or false" })
    .default("true"),
  FNB_CLEANUP_INTERVAL_MINUTES: z.coerce
    .number({ message: "must be a whole number of minutes" })
    .int("must be a whole number of minutes")
    .min(1, "must be at least 1")
    .max(1_440, "must be at most 1440")
    .default(60),
  FNB_SESSION_RETENTION_DAYS: z.coerce
    .number({ message: "must be a whole number of days" })
    .int("must be a whole number of days")
    .min(1, "must be at least 1")
    .max(3_650, "must be at most 3650")
    .default(30),
};

type CleanupValues = z.output<z.ZodObject<typeof cleanupEnvironment>>;

/** Null when the job is turned off, as on all but one process of a deployment. */
export function cleanupSettingsOf(values: CleanupValues): CleanupSettings | null {
  if (values.FNB_CLEANUP_ENABLED === "false") return null;
  return {
    intervalMillis: values.FNB_CLEANUP_INTERVAL_MINUTES * 60_000,
    sessionRetentionMillis: values.FNB_SESSION_RETENTION_DAYS * DAY_MILLIS,
  };
}
