import type { DatabaseToProvision } from "@fnb/db";
import { z } from "zod";

export type ProvisionEnvironmentResult =
  | { readonly ok: true; readonly target: DatabaseToProvision }
  | { readonly ok: false; readonly problems: readonly string[] };

const roleName = z
  .string()
  .regex(/^[a-z_][a-z0-9_]{0,62}$/, "must be a lower-case Postgres role name");

// Long enough that guessing over the network is hopeless; a generated one is 32+ characters.
const password = z
  .string({ required_error: "is required" })
  .min(16, "must be at least 16 characters (openssl rand -base64 24)");

const schema = z
  .object({
    FNB_ADMIN_DATABASE_URL: z
      .string({ required_error: "is required: a role that may create roles and databases" })
      .refine(isPostgresUrl, "is not a postgres:// connection string with a user and a host"),
    FNB_DATABASE_NAME: z
      .string()
      .regex(/^[a-z_][a-z0-9_]{0,62}$/, "must be a lower-case database name")
      .default("fnb"),
    FNB_OWNER_ROLE: roleName.default("fnb_owner"),
    FNB_OWNER_PASSWORD: password,
    FNB_APP_ROLE: roleName.default("fnb_app"),
    FNB_APP_PASSWORD: password,
  })
  .refine((env) => env.FNB_OWNER_ROLE !== env.FNB_APP_ROLE, {
    path: ["FNB_APP_ROLE"],
    message: "must differ from FNB_OWNER_ROLE: the app role must not own the schema",
  });

/** What to provision, from the environment; problems name the variable, never its value. */
export function readProvisionEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): ProvisionEnvironmentResult {
  const present = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ""));
  const parsed = schema.safeParse(present);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`);
    return { ok: false, problems };
  }
  const values = parsed.data;
  return {
    ok: true,
    target: {
      adminUrl: values.FNB_ADMIN_DATABASE_URL,
      database: values.FNB_DATABASE_NAME,
      owner: { user: values.FNB_OWNER_ROLE, password: values.FNB_OWNER_PASSWORD },
      app: { user: values.FNB_APP_ROLE, password: values.FNB_APP_PASSWORD },
    },
  };
}

function isPostgresUrl(text: string): boolean {
  try {
    const url = new URL(text);
    const scheme = url.protocol === "postgres:" || url.protocol === "postgresql:";
    return scheme && url.hostname !== "" && url.username !== "";
  } catch {
    return false;
  }
}
