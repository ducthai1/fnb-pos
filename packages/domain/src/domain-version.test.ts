import { describe, expect, it } from "vitest";
import { DOMAIN_VERSION } from "./index";

describe("domain version", () => {
  it("is exported from the package entry as a semver string", () => {
    expect(DOMAIN_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
