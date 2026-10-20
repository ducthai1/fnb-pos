import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/** Everything the development stack keeps between runs; gitignored, deleted by --reset. */
export const DEV_STACK_DIRECTORY = join(REPO_ROOT, "tmp", "dev-stack");

export const DEV_STACK_PATHS = {
  postgresData: join(DEV_STACK_DIRECTORY, "postgres-data"),
  /** Passwords, PINs and keys generated on the first run, with the ids the seed reuses. */
  logins: join(DEV_STACK_DIRECTORY, "credentials.json"),
  /** Where the running stack listens and which shop it serves, for dev:bank-notice. */
  runningStack: join(DEV_STACK_DIRECTORY, "running-stack.json"),
} as const;
