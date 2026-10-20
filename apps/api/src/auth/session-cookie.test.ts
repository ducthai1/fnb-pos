import { describe, expect, it } from "vitest";
import { INSECURE_SESSION_COOKIE, SESSION_COOKIE, sessionCookieJar } from "./session-cookie";

const secure = sessionCookieJar({ secure: true });
const insecure = sessionCookieJar({ secure: false });

describe("reading the session cookie", () => {
  it("finds the session cookie among others", () => {
    expect(secure.read(`theme=dark; ${SESSION_COOKIE}=abc_-1; lang=vi`)).toBe("abc_-1");
  });

  it("ignores a cookie whose name only ends like it", () => {
    expect(secure.read("fnb_session=stolen; x__Host-fnb_session=also")).toBeNull();
  });

  it.each([undefined, "", "theme=dark", `${SESSION_COOKIE}=`, SESSION_COOKIE])(
    "is null for %j",
    (header) => {
      expect(secure.read(header)).toBeNull();
    },
  );

  it("never reads a cookie of the other kind", () => {
    expect(insecure.read(`${SESSION_COOKIE}=abc`)).toBeNull();
    expect(insecure.read(`${INSECURE_SESSION_COOKIE}=abc`)).toBe("abc");
  });
});

describe("session cookie headers", () => {
  it("set and clear the same secure cookie with the same attributes", () => {
    expect(secure.set("t", 60)).toBe(
      `${SESSION_COOKIE}=t; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=60`,
    );
    expect(secure.cleared()).toBe(
      `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    );
  });

  it("drop Secure and the __Host- prefix together when told to", () => {
    expect(insecure.set("t", 60)).toBe(
      `${INSECURE_SESSION_COOKIE}=t; Path=/; HttpOnly; SameSite=Lax; Max-Age=60`,
    );
    expect(insecure.cleared()).toBe(
      `${INSECURE_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    );
  });
});
