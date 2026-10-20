import { describe, expect, it } from "vitest";
import type { ApiFailure } from "../api/api-result";
import { flagViolationOf } from "./flag-violation";

const SCOPE_ID = "0190a000-0000-7000-8000-0000000000b1";
const failure = (status: number, body: unknown): ApiFailure => ({
  ok: false,
  status,
  code: (body as { code?: string } | null)?.code ?? null,
  body,
});
const details = { flag: "qr_ordering", other: "tables", scopeKind: "branch", scopeId: SCOPE_ID };

describe("reading a refused switch write", () => {
  it("reads which switch needs which, and where", () => {
    expect(flagViolationOf(failure(400, { code: "FLAGS_REQUIRES_MISSING", details }))).toEqual({
      rule: "requires",
      ...details,
    });
    expect(flagViolationOf(failure(400, { code: "FLAGS_EXCLUDES_BOTH_ON", details }))?.rule).toBe("excludes");
  });

  it.each([
    ["another code", failure(400, { code: "API_INVALID_REQUEST", details })],
    ["another status", failure(409, { code: "FLAGS_REQUIRES_MISSING", details })],
    ["no details", failure(400, { code: "FLAGS_REQUIRES_MISSING" })],
    ["a place of no known kind", failure(400, { code: "FLAGS_REQUIRES_MISSING", details: { ...details, scopeKind: "tenant" } })],
    ["a switch that is not named", failure(400, { code: "FLAGS_REQUIRES_MISSING", details: { ...details, other: 7 } })],
  ])("reads nothing from %s", (_case, refusal) => {
    expect(flagViolationOf(refusal)).toBeNull();
  });
});
