import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** A media directory for one run's API, under e2e/tmp (gitignored), removed at the end. */
export function scratchMediaDirectory(): { path: string; remove(): Promise<void> } {
  const path = join(dirname(fileURLToPath(import.meta.url)), "../tmp", `media-${randomUUID()}`);
  return { path, remove: () => rm(path, { recursive: true, force: true }) };
}
