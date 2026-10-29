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

/** Puts the release id into the bundle and emits `version.json` beside index.html. */
export function releaseStamp(releaseId: string, builtAt: Date): Plugin {
  return {
    name: "fnb-release-stamp",
    config: () => ({
      define: { "import.meta.env.VITE_FNB_RELEASE_ID": JSON.stringify(releaseId) },
    }),
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: VERSION_FILE,
        source: `${JSON.stringify({ releaseId, builtAt: builtAt.toISOString() }, null, 2)}\n`,
      });
    },
  };
}
