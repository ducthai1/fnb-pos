import { isAbsolute } from "node:path";
import { z } from "zod";

export type EnvironmentResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly string[] };

export interface BackupSettings {
  /** A role that bypasses row level security (pg_dump must see every tenant's rows). */
  readonly databaseUrl: string;
  readonly directory: string;
  readonly keep: number;
}

export interface RestoreSettings {
  /** A role that may create databases, connected to a maintenance database. */
  readonly adminUrl: string;
  /** The role the restored database is owned by, as provisioning names it. */
  readonly ownerRole: string;
}

const postgresUrl = (required: string) =>
  z
    .string({ required_error: `is required: ${required}` })
    .refine(isPostgresUrl, "is not a postgres:// connection string with a user");

const backupSchema = z.object({
  FNB_BACKUP_DATABASE_URL: postgresUrl("the database to back up, as a role that bypasses RLS"),
  FNB_BACKUP_DIRECTORY: z
    .string({ required_error: "is required: an absolute directory for the backup files" })
    .refine(isAbsolute, "must be an absolute path"),
  FNB_BACKUP_KEEP: z.coerce
    .number({ message: "must be a whole number of backups" })
    .int("must be a whole number of backups")
    .min(1, "must be at least 1")
    .max(1_000, "must be at most 1000")
    .default(14),
});

const restoreSchema = z.object({
  FNB_RESTORE_ADMIN_URL: postgresUrl("a role that may create databases, on database postgres"),
  FNB_OWNER_ROLE: z
    .string()
    .regex(/^[a-z_][a-z0-9_]{0,62}$/, "must be a lower-case Postgres role name")
    .default("fnb_owner"),
});

/** Problems name the variable, never its value: a URL may carry a password. */
function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, env: Env): EnvironmentResult<T> {
  const present = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ""));
  const parsed = schema.safeParse(present);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    problems: parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`),
  };
}

type Env = Readonly<Record<string, string | undefined>>;

export function readBackupSettings(env: Env): EnvironmentResult<BackupSettings> {
  const result = parse(backupSchema, env);
  if (!result.ok) return result;
  const { FNB_BACKUP_DATABASE_URL, FNB_BACKUP_DIRECTORY, FNB_BACKUP_KEEP } = result.value;
  return {
    ok: true,
    value: {
      databaseUrl: FNB_BACKUP_DATABASE_URL,
      directory: FNB_BACKUP_DIRECTORY,
      keep: FNB_BACKUP_KEEP,
    },
  };
}

export function readRestoreSettings(env: Env): EnvironmentResult<RestoreSettings> {
  const result = parse(restoreSchema, env);
  if (!result.ok) return result;
  return {
    ok: true,
    value: { adminUrl: result.value.FNB_RESTORE_ADMIN_URL, ownerRole: result.value.FNB_OWNER_ROLE },
  };
}

export function isPostgresUrl(text: string): boolean {
  try {
    const url = new URL(text);
    const scheme = url.protocol === "postgres:" || url.protocol === "postgresql:";
    return scheme && url.username !== "" && url.pathname.length > 1;
  } catch {
    return false;
  }
}
