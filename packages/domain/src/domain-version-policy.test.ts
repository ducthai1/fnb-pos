import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DOMAIN_VERSION } from "./domain-version";
import { isSupportedDomainVersion } from "./domain-version-policy";

describe("isSupportedDomainVersion", () => {
  it.each<[string, string, boolean]>([
    ["1.2.3", "1.2.3", true],
    ["1.2.4", "1.2.3", true],
    ["1.3.0", "1.2.9", true],
    ["2.0.0", "1.9.9", true],
    ["0.10.0", "0.9.0", true],
    ["0.1.10", "0.1.9", true],
    ["10.0.0", "9.99.99", true],
    ["12345678901234567890.0.1", "12345678901234567890.0.0", true],
    ["1.2.2", "1.2.3", false],
    ["1.1.9", "1.2.0", false],
    ["0.9.9", "1.0.0", false],
    ["0.9.0", "0.10.0", false],
    ["12345678901234567890.0.0", "12345678901234567890.0.1", false],
  ])("client %s against minimum %s is %s", (client, minimum, expected) => {
    expect(isSupportedDomainVersion(client, minimum)).toBe(expected);
  });

  it.each([
    "",
    "1",
    "1.2",
    "1.2.3.4",
    "v1.2.3",
    "1.2.3-beta.1",
    "1.2.3+build.5",
    " 1.2.3",
    "1.2.3\n",
    "01.2.3",
    "1.02.3",
    "1.2.03",
    "1.2.x",
    "-1.2.3",
    "1..3",
    "１.2.3",
  ])("refuses the malformed version %j on either side", (malformed) => {
    expect(isSupportedDomainVersion(malformed, "0.0.0")).toBe(false);
    expect(isSupportedDomainVersion("99.99.99", malformed)).toBe(false);
  });

  it("supports the version this package ships", () => {
    expect(isSupportedDomainVersion(DOMAIN_VERSION, DOMAIN_VERSION)).toBe(true);
  });
});

describe("isSupportedDomainVersion on random versions", () => {
  const part = fc.bigInt({ min: 0n, max: 10n ** 20n });
  const version = fc.tuple(part, part, part).map((parts) => parts.join("."));

  it("orders any two versions one way or the other, and both ways only when equal", () => {
    fc.assert(
      fc.property(version, version, (a, b) => {
        const both = isSupportedDomainVersion(a, b) && isSupportedDomainVersion(b, a);
        expect(isSupportedDomainVersion(a, b) || isSupportedDomainVersion(b, a)).toBe(true);
        expect(both).toBe(a === b);
      }),
    );
  });

  it("refuses a client one step behind the minimum in any part", () => {
    fc.assert(
      fc.property(fc.tuple(part, part, part), fc.nat({ max: 2 }), (parts, bumped) => {
        const minimum = parts.map((p, i) => (i === bumped ? p + 1n : p)).join(".");
        expect(isSupportedDomainVersion(parts.join("."), minimum)).toBe(false);
        expect(isSupportedDomainVersion(minimum, parts.join("."))).toBe(true);
      }),
    );
  });
});
