import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../build-app";
import { type ServerErrorReport, maskSecrets, serverErrorLines } from "./server-error-report";

describe("masking secrets in what the server logs", () => {
  it.each([
    [
      "a database connection string",
      "connect to postgresql://fnb_app:s3cr3t-pw@10.0.0.5:5432/fnb failed",
      "connect to postgresql://***@10.0.0.5:5432/fnb failed",
      "s3cr3t-pw",
    ],
    [
      "a password",
      "login with password=hunter2 refused",
      "login with password=*** refused",
      "hunter2",
    ],
    ["a PIN", "staff pin: 4826 is wrong", "staff pin: *** is wrong", "4826"],
    [
      "a session cookie",
      "cookie: __Host-fnb_session=Zm9vYmFy.c2lnbg; theme=dark",
      "cookie: ***; theme=dark",
      "Zm9vYmFy",
    ],
    [
      "a till's credential",
      "authorization: Device 3f9a1c22b7e04d5c9a8e",
      "authorization: *** ***",
      "3f9a1c22b7e04d5c9a8e",
    ],
    [
      "a bearer token on its own",
      "upstream said Bearer eyJhbGciOi.xyz.abc",
      "upstream said Bearer ***",
      "eyJhbGciOi",
    ],
    [
      "a webhook secret",
      'gateway webhook_secret="whsec_9x8y7z" rejected',
      "gateway webhook_secret=*** rejected",
      "whsec_9x8y7z",
    ],
  ])("masks %s", (_label, text, masked, secret) => {
    expect(maskSecrets(text)).toBe(masked);
    expect(maskSecrets(text)).not.toContain(secret);
  });

  it("leaves what is not a credential as it was", () => {
    const plain = 'relation "fnb_auth.session" does not exist; shipping 2 items to table B01';
    expect(maskSecrets(plain)).toBe(plain);
  });
});

describe("a request the server fails", () => {
  const reports: ServerErrorReport[] = [];
  // Never queried: the route under test throws before touching the database.
  const pool = new pg.Pool({ connectionString: "postgresql://nobody@127.0.0.1:1/none" });
  const app = buildApp({ pool, onServerError: (report) => reports.push(report) });
  app.post("/boom/:id", async () => {
    const error = new Error("insert failed for postgresql://fnb_app:pw-123@db/x, pin=7391");
    Object.assign(error, { code: "23505" });
    throw error;
  });
  app.post("/refused", async (_request, reply) => reply.code(409).send({ code: "X" }));
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("answers only API_INTERNAL, and reports the route, the code and the masked message", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/boom/42?pin=1111",
      headers: { cookie: "__Host-fnb_session=abc", authorization: "Device tok-tok-tok-tok" },
      payload: { pin: "2468" },
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ code: "API_INTERNAL" });
    expect(reports).toHaveLength(1);
    const [report] = reports;
    expect(report).toMatchObject({ method: "POST", route: "/boom/:id", code: "23505" });
    const logged = serverErrorLines(report!).join("\n");
    expect(logged).toContain("request failed: POST /boom/:id -> 500 [23505]");
    for (const secret of ["pw-123", "7391", "1111", "2468", "abc", "tok-tok"]) {
      expect(logged).not.toContain(secret);
    }
  });

  it("reports nothing for a request answered with a client error", async () => {
    reports.length = 0;
    expect((await app.inject({ method: "POST", url: "/refused" })).statusCode).toBe(409);
    expect((await app.inject({ method: "GET", url: "/nowhere" })).statusCode).toBe(404);
    expect(reports).toEqual([]);
  });
});
