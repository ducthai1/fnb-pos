import { randomBytes } from "node:crypto";
import { testConnectionString } from "@fnb/db/test-support";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { type ApiProcess, listeningUrl, spawnApi } from "../support/api-process";
import { type ScratchDatabase, createScratchDatabase } from "../support/scratch-database";

const info = inject("testPostgres");

describe("the API entrypoint, when a request fails on the server", () => {
  // A database no migration ever ran on: the server starts, and every query of a route
  // fails, the way a broken deployment does.
  let scratch: ScratchDatabase;
  let api: ApiProcess;

  beforeAll(async () => {
    scratch = await createScratchDatabase(info);
  });

  afterAll(async () => {
    if (api.child.exitCode === null && api.child.signalCode === null) api.child.kill("SIGKILL");
    await api.exited;
    await scratch.drop();
  });

  it("logs the route and the error to stderr, and none of the request's secrets", async () => {
    api = spawnApi({
      FNB_ENV: "development",
      FNB_DATABASE_URL: testConnectionString(info, "app", scratch.name),
      PORT: "0",
    });
    const url = await listeningUrl(api);
    const password = `Pw-${randomBytes(6).toString("hex")}`;
    const token = randomBytes(12).toString("hex");
    const answer = await fetch(`${url}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `__Host-fnb_session=${token}` },
      body: JSON.stringify({ email: "chu-quan@example.vn", password }),
    });
    expect(answer.status).toBe(500);
    expect(await answer.json()).toEqual({ code: "API_INTERNAL" });
    await expect.poll(() => api.output.stderr).toContain("request failed: POST /auth/login -> 500");
    const printed = api.output.stdout + api.output.stderr;
    for (const secret of [password, token, info.app.password, "chu-quan@example.vn"]) {
      expect(printed).not.toContain(secret);
    }
    api.child.kill("SIGTERM");
    expect(await api.exited).toBe(0);
  });
});
