import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export { faultyDriver, orderCommand, testId } from "./local-store-fixtures";

// Under the package, not the OS temp dir: /tmp is often tmpfs, where fsync is free and any
// timing of a FULL-synchronous write would look ~30 times better than on a till's disk.
const TMP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../tmp");

/** A fresh directory for database files; remove() deletes it with everything inside. */
export function scratchDirectory(label: string) {
  const path = join(TMP_ROOT, `${label}-${randomUUID()}`);
  mkdirSync(path, { recursive: true });
  return { path, remove: () => rmSync(path, { recursive: true, force: true }) };
}
