import { type ZodErrorMap, z } from "zod";
import type { RateLimitSettings } from "../http/rate-limit-hooks";
import { PAYMENT_SECRET_KEY_ENV } from "../payments/webhook-secret-box";
import { rateLimitEnvironment, rateLimitSettingsOf } from "./rate-limit-environment";

/** What the server process is started with, read once from its environment. */
export interface ServerConfig {
  readonly environment: "development" | "production";
  readonly host: string;
  readonly port: number;
  /** Connects as the app role. A secret: never printed. */
  readonly databaseUrl: string;
  /** Seals gateway secrets; without it no bank notice is taken. A secret: never printed. */
  readonly paymentSecretKey: Buffer | null;
  /** `none`: branches cannot turn invoices on. `fake`: invoices that exist nowhere. */
  readonly einvoiceProvider: "none" | "fake";
  readonly einvoiceWorkerIntervalMs: number;
  readonly secureCookies: boolean;
  /** Browser origins whose pages may write; null checks none. */
  readonly allowedOrigins: readonly string[] | null;
  /** Sign-in, pairing, PIN and approval requests allowed per client and per account or till. */
  readonly rateLimits: RateLimitSettings;
}

export type ServerConfigResult =
  | { readonly ok: true; readonly config: ServerConfig }
  | { readonly ok: false; readonly problems: readonly string[] };

const flag = z.enum(["true", "false"], { message: "must be true or false" });

const databaseUrl = z
  .string({ required_error: "is required: the app role's postgres:// connection string" })
  .min(1, "is required: the app role's postgres:// connection string")
  .refine(isPostgresUrl, "is not a postgres:// connection string with a user and a host");

const origins = z
  .string()
  .transform((text) => text.split(",").map((origin) => origin.trim()))
  .refine(
    (list) => list.length > 0 && list.every(isOrigin),
    "must be a comma separated list of origins such as https://pos.example.vn",
  );

const environmentSchema = z
  .object({
    FNB_ENV: z.enum(["development", "production"], {
      message: "must be development or production",
    }),
    HOST: z.string().min(1, "must not be empty").default("127.0.0.1"),
    PORT: z.coerce
      .number({ message: "must be a port number" })
      .int("must be a port number")
      .min(0, "must be a port number")
      .max(65_535, "must be a port number")
      .default(3000),
    FNB_DATABASE_URL: databaseUrl,
    [PAYMENT_SECRET_KEY_ENV]: z
      .string()
      .refine(
        (text) => Buffer.from(text, "base64").length === 32,
        "must be 32 bytes in base64 (openssl rand -base64 32)",
      )
      .optional(),
    FNB_EINVOICE_PROVIDER: z.enum(["none", "fake"], { message: "must be none or fake" }).optional(),
    FNB_EINVOICE_WORKER_INTERVAL_MS: z.coerce
      .number({ message: "must be a whole number of milliseconds" })
      .int("must be a whole number of milliseconds")
      .min(1_000, "must be at least 1000")
      .default(5_000),
    FNB_COOKIE_SECURE: flag.default("true"),
    FNB_ALLOWED_ORIGINS: origins.optional(),
    ...rateLimitEnvironment,
  })
  .superRefine((env, context) => {
    if (env.FNB_ENV !== "production") return;
    const problem = (path: string, message: string) =>
      context.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (env.FNB_EINVOICE_PROVIDER === undefined) {
      problem("FNB_EINVOICE_PROVIDER", "is required in production: name the provider or none");
    } else if (env.FNB_EINVOICE_PROVIDER === "fake") {
      problem("FNB_EINVOICE_PROVIDER", "cannot be fake in production: its invoices exist nowhere");
    }
    if (env.FNB_COOKIE_SECURE === "false") {
      problem("FNB_COOKIE_SECURE", "cannot be false in production");
    }
    if (env.FNB_ALLOWED_ORIGINS === undefined) {
      problem("FNB_ALLOWED_ORIGINS", "is required in production");
    }
  });

// Some of zod's own messages quote the value they refused ("received 'x'"), and a refused
// value may be a password. Every message above is written without it; this catches any
// default message that would still slip through.
const withoutValues: ZodErrorMap = (_issue, context) => ({
  message: /received\s+['"]/.test(context.defaultError) ? "is not valid" : context.defaultError,
});

/**
 * The server's configuration from its environment. FNB_ENV has no default on purpose: a
 * deployment that forgets it must not start with development's fake invoice provider.
 * Problems name the variable and what is wrong with it, never the value given.
 */
export function readServerConfig(
  env: Readonly<Record<string, string | undefined>>,
): ServerConfigResult {
  const present = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ""));
  const parsed = environmentSchema.safeParse(present, { errorMap: withoutValues });
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`);
    return { ok: false, problems };
  }
  const values = parsed.data;
  const key = values[PAYMENT_SECRET_KEY_ENV];
  return {
    ok: true,
    config: {
      environment: values.FNB_ENV,
      host: values.HOST,
      port: values.PORT,
      databaseUrl: values.FNB_DATABASE_URL,
      paymentSecretKey: key === undefined ? null : Buffer.from(key, "base64"),
      einvoiceProvider: values.FNB_EINVOICE_PROVIDER ?? "fake",
      einvoiceWorkerIntervalMs: values.FNB_EINVOICE_WORKER_INTERVAL_MS,
      secureCookies: values.FNB_COOKIE_SECURE === "true",
      allowedOrigins: values.FNB_ALLOWED_ORIGINS ?? null,
      rateLimits: rateLimitSettingsOf(values),
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

function isOrigin(text: string): boolean {
  try {
    const url = new URL(text);
    return (url.protocol === "http:" || url.protocol === "https:") && url.origin === text;
  } catch {
    return false;
  }
}
