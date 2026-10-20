import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { safeReturnPath } from "./safe-return-path";

const ORIGIN = "https://quanly.example";

// Built from code points, so the file holds no invisible characters.
const ch = (code: number) => String.fromCodePoint(code);
const NBSP = ch(0xa0);
const ZERO_WIDTH = ch(0x200b);
const LINE_SEPARATOR = ch(0x2028);
const BOM = ch(0xfeff);
const IDEOGRAPHIC_SPACE = ch(0x3000);
const FULLWIDTH_SLASH = ch(0xff0f);
const back = (next: string | null) => safeReturnPath(next, ORIGIN);

describe("where signing in returns to", () => {
  it.each([
    ["/menu/products/abc?new=1", "/menu/products/abc?new=1"],
    ["/devices", "/devices"],
    ["/reports/daily-sales?date=2026-10-20#items", "/reports/daily-sales?date=2026-10-20#items"],
    ["/menu/Tr%C3%A0", "/menu/Tr%C3%A0"],
    // Resolved the way the browser would, so the check and the navigation agree.
    ["/menu/../staff", "/staff"],
  ])("returns to %j as %j", (next, expected) => {
    expect(back(next)).toBe(expected);
  });

  it.each([
    // Not a path of this site at all.
    null,
    "",
    "menu",
    "https://evil.example/",
    "HTTPS://evil.example/",
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,x",
    // Two slashes, or something a parser reads as the second one.
    "//evil.example/x",
    "/\\evil.example",
    "\\/evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r/evil.example",
    "/\r\n/evil.example",
    // The same, percent-encoded once or twice: the reported %2F%09%2F and friends.
    "%2F%09%2Fevil.example",
    "/%09/evil.example",
    "/%0a/evil.example",
    "/%0D%0A/evil.example",
    "/%5Cevil.example",
    "/%5cevil.example",
    "%2F%2Fevil.example",
    "/%2F/evil.example",
    "/%252F/evil.example",
    "/%2509/evil.example",
    // Dot segments that collapse into a second leading slash once resolved.
    "/.//evil.example",
    "/x/..//evil.example",
    "/%2e//evil.example",
    "/%2E%2E//evil.example",
    // A control, space or invisible character anywhere, not only after the first slash.
    "/menu\t",
    "/me nu",
    "/menu\u0000",
    `/menu${NBSP}x`,
    `/menu${ZERO_WIDTH}x`,
    `/menu${LINE_SEPARATOR}x`,
    `/menu${BOM}`,
    "/menu%20x",
    "/menu%00",
    // Percent-encoding that is not one.
    "/menu%",
    "/menu%zz",
  ])("goes home instead of to %j", (next) => {
    expect(back(next)).toBe("/");
  });

  it("never returns to the sign-in page itself", () => {
    expect(back("/login?next=%2F")).toBe("/");
    expect(back("/login")).toBe("/");
    expect(back("/login/")).toBe("/");
    expect(back("/logins")).toBe("/logins");
  });
});

/** Pieces that bend URL parsers, put together in any order. */
const hostilePiece = fc.constantFrom(
  "/", "//", "\\", "\t", "\n", "\r", " ", IDEOGRAPHIC_SPACE, LINE_SEPARATOR, ZERO_WIDTH, NBSP,
  "%09", "%0a", "%0D", "%5c", "%5C", "%2f", "%2F", "%25", "%20", "%", "%%",
  "evil.example", "@", ":", ".", "..", "/.", "/..", "./", "%2e", "?", "#", "https:", "HTTP:", "javascript:", FULLWIDTH_SLASH, "menu",
);
const anyText = fc.oneof(
  fc.string({ unit: "binary", maxLength: 40 }),
  fc.array(hostilePiece, { maxLength: 12 }).map((pieces) => pieces.join("")),
);

describe("a return path of any text", () => {
  it("always stays on the site's own origin, as a single-slash path", () => {
    fc.assert(
      fc.property(anyText, (next) => {
        const path = back(next);
        expect(path.startsWith("/") && !path.startsWith("//")).toBe(true);
        expect(new URL(path, ORIGIN).origin).toBe(ORIGIN);
      }),
      { numRuns: 3000 },
    );
  });

  it("is already safe once filtered: filtering again changes nothing", () => {
    fc.assert(
      fc.property(anyText, (next) => {
        const path = back(next);
        expect(back(path)).toBe(path);
      }),
      { numRuns: 3000 },
    );
  });
});
