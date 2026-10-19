import { findFreePort, testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";

const info = inject("testPostgres");

describe("GET /health", () => {
  let reachable: pg.Pool;
  let unreachable: pg.Pool;

  beforeAll(async () => {
    reachable = new pg.Pool({ connectionString: testConnectionString(info, "app") });
    // Nothing listens on a port that was free a moment ago, so connecting is refused.
    const deadPort = await findFreePort();
    unreachable = new pg.Pool({
      connectionString: `postgresql://nobody:nothing@127.0.0.1:${deadPort}/none`,
      connectionTimeoutMillis: 2_000,
    });
  });

  afterAll(async () => {
    await Promise.all([reachable.end(), unreachable.end()]);
  });

  it("answers 200 when the database answers as the app role", async () => {
    const app = buildApp({ pool: reachable });
    const response = await app.inject({ method: "GET", url: "/health" });
    await app.close();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", database: "ok" });
  });

  it("answers 503 when the database cannot be reached", async () => {
    const app = buildApp({ pool: unreachable });
    const response = await app.inject({ method: "GET", url: "/health" });
    await app.close();
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "unavailable", database: "unreachable" });
  });
});
