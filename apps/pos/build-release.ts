import { execFileSync } from "node:child_process";
import type { Plugin } from "vite";

/** The file next to index.html that names the release being served. */
export const VERSION_FILE = "version.json";

export interface ReleaseEnvironment {
  readonly version: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** The short git commit of the working tree, or null where git cannot say. */
  readonly gitSha: () => string | null;
  readonly now: () => Date;
}

/**
 * What names this build: an id the packaging step chose (FNB_RELEASE_ID), else the app's
 * version and the short commit. Where git is absent (a source tarball) the commit is
 * replaced by the build's minute, so two builds of different code never share an id.
 */
export function releaseIdOf({ version, env, gitSha, now }: ReleaseEnvironment): string {
  const chosen = env.FNB_RELEASE_ID?.trim();
  if (chosen) return chosen;
  const sha = gitSha();
  if (sha !== null) return `${version}+${sha}`;
  const stamp = now().toISOString().replace(/\D/g, "").slice(0, 12);
  return `${version}+local${stamp}`;
}

export interface BuildNumberEnvironment {
  readonly env: Readonly<Record<string, string | undefined>>;
  /** When the commit being built was made, in whole seconds since the epoch; null where git cannot say. */
  readonly commitSeconds: () => number | null;
  readonly now: () => Date;
}

/**
 * The number a server compares against its minimum build: it only ever grows from one build
 * to the next, which the release id (a commit hash) cannot do. It is the commit's time in
 * seconds, so rebuilding old code never makes it newer; where git is absent it is the
 * build's own time. FNB_RELEASE_BUILD lets the packaging step choose it.
 */
export function buildNumberOf({ env, commitSeconds, now }: BuildNumberEnvironment): number {
  const chosen = env.FNB_RELEASE_BUILD?.trim();
  if (chosen) {
    if (!/^[1-9][0-9]{0,14}$/.test(chosen)) {
      throw new Error("FNB_RELEASE_BUILD must be a whole number of at least 1");
    }
    return Number(chosen);
  }
  return commitSeconds() ?? Math.floor(now().getTime() / 1000);
}

export function commitSecondsOf(cwd: string): number | null {
  try {
    const seconds = execFileSync("git", ["log", "-1", "--format=%ct"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return /^[0-9]{1,15}$/.test(seconds) && Number(seconds) > 0 ? Number(seconds) : null;
  } catch {
    return null;
  }
}

export function shortGitSha(cwd: string): string | null {
  try {
    const sha = execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return /^[0-9a-f]{7,}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

/** Puts the release id and build number into the bundle and emits `version.json` beside index.html. */
export function releaseStamp(releaseId: string, builtAt: Date, buildNumber: number): Plugin {
  return {
    name: "fnb-release-stamp",
    config: () => ({
      define: {
        "import.meta.env.VITE_FNB_RELEASE_ID": JSON.stringify(releaseId),
        "import.meta.env.VITE_FNB_RELEASE_BUILD": JSON.stringify(String(buildNumber)),
      },
    }),
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: VERSION_FILE,
        source: `${JSON.stringify(
          { releaseId, build: buildNumber, builtAt: builtAt.toISOString() },
          null,
          2,
        )}\n`,
      });
    },
  };
}
