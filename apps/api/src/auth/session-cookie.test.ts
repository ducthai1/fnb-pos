import { describe, expect, it } from "vitest";
import {
  SESSION_COOKIE,
  clearedSessionCookie,
  readSessionToken,
  sessionCookie,
} from "./session-cookie";

describe("readSessionToken", () => {
  it("finds the session cookie among others", () => {
    expect(readSessionToken(`theme=dark; ${SESSION_COOKIE}=abc_-1; lang=vi`)).toBe("abc_-1");
  });

  it("ignores a cookie whose name only ends like it", () => {
    expect(readSessionToken("fnb_session=stolen; x__Host-fnb_session=also")).toBeNull();
  });

  it.each([undefined, "", "theme=dark", `${SESSION_COOKIE}=`, SESSION_COOKIE])(
    "is null for %j",
    (header) => {
      expect(readSessionToken(header)).toBeNull();
    },
  );
});

describe("session cookie headers", () => {
  it("set and clear the same cookie with the same attributes", () => {
    expect(sessionCookie("t", 60)).toBe(
      `${SESSION_COOKIE}=t; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=60`,
    );
    expect(clearedSessionCookie()).toBe(
      `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    );
  });
});
