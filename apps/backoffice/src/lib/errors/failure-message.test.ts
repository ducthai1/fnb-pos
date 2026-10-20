import { CATALOG_ERROR_CODES, PERMISSIONS_ERROR_CODES, PRICING_ERROR_CODES } from "@fnb/domain";
import { describe, expect, it } from "vitest";
import { vi } from "../../messages/vi";
import { failureMessage, isPermissionDenied, isSignedOut, messageForCode } from "./failure-message";

const failure = (status: number | null, code: string | null) => ({ status, code });

describe("error code to Vietnamese sentence", () => {
  it.each([
    ["API_AUTH_INVALID_CREDENTIALS", /Sai email\/số điện thoại hoặc mật khẩu/],
    ["API_PERMISSION_DENIED", /không có quyền/],
    ["API_CATALOG_VERSION_CONFLICT", /Có người đã sửa/],
    ["API_STAFF_PIN_TOO_WEAK", /PIN quá dễ đoán/],
    ["API_ROLE_LAST_ADMINISTRATOR", /quản lý nhân viên/],
    ["DOMAIN_CATALOG_MIN_SELECT_ABOVE_MAX_SELECT", /tối thiểu đang lớn hơn số tối đa/],
    ["DOMAIN_CATALOG_UNSATISFIABLE_MODIFIER_GROUP", /không thể chọn đủ/],
  ])("says what %s means", (code, sentence) => {
    expect(failureMessage(failure(400, code))).toMatch(sentence);
  });

  it("shows a code it does not know with the code itself, never an empty or raw message", () => {
    const message = failureMessage(failure(400, "DOMAIN_SOME_FUTURE_RULE"));
    expect(message).toBe(vi.errors.unknown("DOMAIN_SOME_FUTURE_RULE"));
    expect(message).toContain("DOMAIN_SOME_FUTURE_RULE");
  });

  it("does not mistake an inherited object key for a known code", () => {
    expect(messageForCode("toString")).toBe(vi.errors.unknown("toString"));
    expect(messageForCode("__proto__")).toBe(vi.errors.unknown("__proto__"));
  });

  it("tells a dropped connection apart from a refusal", () => {
    expect(failureMessage(failure(null, null))).toBe(vi.errors.network);
    expect(failureMessage(failure(502, null))).toBe(vi.errors.unexpected(502));
  });

  // The editor runs these rules before saving and the API answers with them: a rule
  // without a sentence would show its bare code to a shop owner.
  it.each([
    ...Object.values(CATALOG_ERROR_CODES),
    PRICING_ERROR_CODES.missingBasePrice,
    PRICING_ERROR_CODES.scopeVariantNotOnProduct,
    ...Object.values(PERMISSIONS_ERROR_CODES).filter((code) => !code.endsWith("ACTION_VALUE")),
  ])("has a sentence for the domain rule %s", (code) => {
    expect(messageForCode(code)).not.toBe(vi.errors.unknown(code));
  });

  it("recognises a missing key and a lost session, and nothing else as either", () => {
    expect(isPermissionDenied(failure(403, "API_PERMISSION_DENIED"))).toBe(true);
    expect(isPermissionDenied(failure(403, "API_AUTH_NOT_A_MEMBER"))).toBe(false);
    expect(isPermissionDenied(failure(400, "API_PERMISSION_DENIED"))).toBe(false);
    expect(isSignedOut(failure(401, "API_AUTH_UNAUTHENTICATED"))).toBe(true);
    expect(isSignedOut(failure(401, "API_AUTH_INVALID_CREDENTIALS"))).toBe(false);
  });
});
