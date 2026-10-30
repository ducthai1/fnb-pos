import { describe, expect, it } from "vitest";
import { buildNumberOf, releaseIdOf } from "./build-release";

const base = {
  version: "0.3.0",
  env: {},
  gitSha: () => "abc1234",
  now: () => new Date("2026-10-29T10:05:59Z"),
};

describe("the release id of a build", () => {
  it("is the version and the short commit", () => {
    expect(releaseIdOf(base)).toBe("0.3.0+abc1234");
  });

  it("is the id the packaging step chose, when it chose one", () => {
    expect(releaseIdOf({ ...base, env: { FNB_RELEASE_ID: " r-42 " } })).toBe("r-42");
  });

  it("carries the build's minute where git cannot name a commit", () => {
    expect(releaseIdOf({ ...base, gitSha: () => null })).toBe("0.3.0+local202610291005");
  });
});

describe("the build number of a build", () => {
  const environment = {
    env: {},
    commitSeconds: () => 1_761_800_000,
    now: () => new Date("2026-10-29T10:05:59Z"),
  };

  it("is the commit's time, so rebuilding old code never makes it newer", () => {
    expect(buildNumberOf(environment)).toBe(1_761_800_000);
    expect(buildNumberOf({ ...environment, now: () => new Date("2030-01-01T00:00:00Z") })).toBe(
      1_761_800_000,
    );
  });

  it("is the build's own time in seconds where git cannot name a commit", () => {
    expect(buildNumberOf({ ...environment, commitSeconds: () => null })).toBe(1_793_268_359);
  });

  it("is the number the packaging step chose, and refuses one that is not a number", () => {
    expect(buildNumberOf({ ...environment, env: { FNB_RELEASE_BUILD: " 42 " } })).toBe(42);
    expect(() => buildNumberOf({ ...environment, env: { FNB_RELEASE_BUILD: "0.0.0+abc" } })).toThrow(
      /FNB_RELEASE_BUILD/,
    );
  });
});
