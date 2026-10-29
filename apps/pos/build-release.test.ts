import { describe, expect, it } from "vitest";
import { releaseIdOf } from "./build-release";

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
