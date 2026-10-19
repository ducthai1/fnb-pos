import { describe, expect, it } from "vitest";
import { loginIdentifier, normalizeEmail, normalizeVietnamPhone } from "./login-identifier";

describe("normalizeVietnamPhone", () => {
  it.each([
    "0912345678",
    "0912 345 678",
    "0912.345.678",
    "0912-345-678",
    "(091) 2345678",
    "+84912345678",
    "+84 912 345 678",
    "84912345678",
    "0084912345678",
    " 0912345678 ",
  ])("reads %j as +84912345678", (typed) => {
    expect(normalizeVietnamPhone(typed)).toBe("+84912345678");
  });

  it.each([
    ["too short", "091234567"],
    ["too long", "09123456789"],
    ["a zero after the country code", "+840912345678"],
    ["another country", "+12025550100"],
    ["letters", "09123456ab"],
    ["empty", ""],
    ["a bare 84 prefix of the wrong length", "8491234567"],
    ["a landline, which cannot receive a sign-in code by SMS", "024 3825 1234"],
    ["a mobile prefix that does not exist", "0412345678"],
  ])("rejects %s", (_case, typed) => {
    expect(normalizeVietnamPhone(typed)).toBeNull();
  });

  it("is idempotent: a stored number normalizes to itself", () => {
    expect(normalizeVietnamPhone("+84987654321")).toBe("+84987654321");
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases, as the database stores it", () => {
    expect(normalizeEmail("  Chu.Quan@Example.VN ")).toBe("chu.quan@example.vn");
  });

  it.each(["owner", "@example.vn", "owner@", "chu quan@example.vn", ""])("rejects %j", (typed) => {
    expect(normalizeEmail(typed)).toBeNull();
  });
});

describe("loginIdentifier", () => {
  it("names the account by email or by phone, never both", () => {
    expect(loginIdentifier({ email: "A@B.VN" })).toEqual({ email: "a@b.vn", phone: null });
    expect(loginIdentifier({ phone: "0912345678" })).toEqual({
      email: null,
      phone: "+84912345678",
    });
  });

  it("is null when the given identifier cannot be normalized or none is given", () => {
    expect(loginIdentifier({ phone: "12" })).toBeNull();
    expect(loginIdentifier({ email: "x" })).toBeNull();
    expect(loginIdentifier({})).toBeNull();
  });
});
