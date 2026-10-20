import { randomBytes } from "node:crypto";
import { provisionOrganization } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from "vitest";
import { PASSWORD, createAccount, uniqueEmail } from "../support/backoffice-accounts";
import { type ApiProcess, listeningUrl, spawnApi as spawnApiProcess } from "../support/api-process";

const info = inject("testPostgres");
const POS_ORIGIN = "http://127.0.0.1:5173";

// A process a failed expectation left running would keep its port and pool after the run.
const spawned: ApiProcess[] = [];
const spawnApi = (env: Record<string, string>) => {
  const api = spawnApiProcess(env);
  spawned.push(api);
  return api;
};
afterEach(() => {
  for (const api of spawned.splice(0)) {
    if (api.child.exitCode === null && api.child.signalCode === null) api.child.kill("SIGKILL");
  }
});

describe("the API entrypoint", () => {
  let pool: pg.Pool;
  let email: string;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
    email = uniqueEmail("entrypoint");
    const accountId = await createAccount(pool, { email });
    await provisionOrganization(pool, {
      name: "Quán chạy thật",
      creator: { accountId, displayName: "Chủ quán" },
      now: new Date(),
    });
  });

  afterAll(() => pool.end());

  it("serves health and sign-in on the port it is given, and stops on SIGTERM", async () => {
    const api = spawnApi({
      FNB_ENV: "development",
      FNB_DATABASE_URL: testConnectionString(info, "app"),
      PORT: "0",
      FNB_PAYMENT_SECRET_KEY: randomBytes(32).toString("base64"),
      FNB_ALLOWED_ORIGINS: POS_ORIGIN,
    });
    const url = await listeningUrl(api);
    try {
      const health = await fetch(`${url}/health`);
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ status: "ok", database: "ok" });
      const signIn = (origin: string) =>
        fetch(`${url}/auth/login`, {
          method: "POST",
          headers: { "content-type": "application/json", origin },
          body: JSON.stringify({ email, password: PASSWORD }),
        });
      const signedIn = await signIn(POS_ORIGIN);
      expect(signedIn.status).toBe(200);
      expect(signedIn.headers.get("set-cookie")).toMatch(/^__Host-fnb_session=/);
      expect((await signIn("https://evil.example")).status).toBe(403);
    } finally {
      api.child.kill("SIGTERM");
    }
    expect(await api.exited).toBe(0);
    expect(api.output.stdout).toContain("fnb-api: stopped");
    expect(api.output.stdout).not.toContain(info.app.password);
  });

  it("exits with the problems, and none of the values, when the configuration is wrong", async () => {
    const secret = `not-a-key-${randomBytes(8).toString("hex")}`;
    const api = spawnApi({ FNB_ENV: "development", FNB_PAYMENT_SECRET_KEY: secret });
    expect(await api.exited).toBe(1);
    expect(api.output.stderr).toContain("FNB_DATABASE_URL is required");
    expect(api.output.stderr).toContain("FNB_PAYMENT_SECRET_KEY must be 32 bytes in base64");
    expect(api.output.stderr + api.output.stdout).not.toContain(secret);
    expect(api.output.stdout).not.toContain("listening");
  });

  it("refuses to run as a role that bypasses row level security", async () => {
    const api = spawnApi({
      FNB_ENV: "development",
      FNB_DATABASE_URL: testConnectionString(info, "superuser"),
      PORT: "0",
    });
    expect(await api.exited).toBe(1);
    expect(api.output.stderr).toContain("bypasses row level security");
    expect(api.output.stderr).not.toContain(info.superuser.password);
  });
});
