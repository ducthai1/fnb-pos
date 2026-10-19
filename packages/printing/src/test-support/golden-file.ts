import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import { toHex } from "../bytes/bytes";

export const GOLDEN_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "templates",
  "__golden__",
);

/** Set only by `pnpm --filter @fnb/printing golden:update`; a normal run never writes. */
const updating = () => process.env["UPDATE_GOLDEN"] === "1";

/**
 * Compares output with its golden file. A missing file fails like a different one: writing it
 * on the spot would turn a deleted golden into a pass and hide whatever changed. The only way
 * to change a golden is the update command, and the diff then shows up in review.
 */
export function expectGolden(name: string, actual: string, dir = GOLDEN_DIR): void {
  const path = join(dir, name);
  if (updating()) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, actual);
    return;
  }
  if (!existsSync(path)) {
    throw new Error(`golden file ${name} is missing: run golden:update and review the diff`);
  }
  expect(actual, `golden file ${name}`).toBe(readFileSync(path, "utf8"));
}

/** ESC/POS or TSPL bytes as golden text: each chunk (one printed line) on its own line. */
export function chunksAsHex(chunks: readonly Uint8Array[]): string {
  return `${chunks.map((chunk) => toHex(chunk, 4096)).join("\n")}\n`;
}

/** TSPL is a line-based language: its bytes as golden text, one command per line. */
export function commandsAsHex(chunks: readonly Uint8Array[]): string {
  const lines: string[] = [];
  for (const chunk of chunks) {
    let start = 0;
    chunk.forEach((byte, i) => {
      if (byte !== 0x0a) return;
      lines.push(toHex(chunk.subarray(start, i + 1), 4096));
      start = i + 1;
    });
    if (start < chunk.length) lines.push(toHex(chunk.subarray(start), 4096));
  }
  return `${lines.join("\n")}\n`;
}
