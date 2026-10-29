import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export const SUMS_FILE = "SHA256SUMS";

export function sha256OfFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}

const byPath = ([a]: [string, string], [b]: [string, string]) => (a < b ? -1 : a > b ? 1 : 0);

/** `sha256sum -c` input: "<hash>  <path>" per line, sorted by path. */
export function sumsText(sums: ReadonlyMap<string, string>): string {
  return [...sums.entries()]
    .sort(byPath)
    .map(([path, hash]) => `${hash}  ${path}\n`)
    .join("");
}

export interface ReleaseManifest {
  readonly releaseId: string;
  readonly gitSha: string | null;
  readonly builtAt: string;
  readonly tarball: { readonly file: string; readonly sha256: string; readonly bytes: number };
  /** The migrations this release carries, in the order they run. */
  readonly migrations: readonly string[];
  /** sha256 of every file in the tarball (the same sums as its SHA256SUMS). */
  readonly files: Readonly<Record<string, string>>;
}

export function buildManifest(input: {
  releaseId: string;
  gitSha: string | null;
  builtAt: Date;
  tarball: ReleaseManifest["tarball"];
  migrations: readonly string[];
  sums: ReadonlyMap<string, string>;
}): ReleaseManifest {
  return {
    releaseId: input.releaseId,
    gitSha: input.gitSha,
    builtAt: input.builtAt.toISOString(),
    tarball: input.tarball,
    migrations: input.migrations,
    files: Object.fromEntries([...input.sums.entries()].sort(byPath)),
  };
}
