import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { testConnectionString } from "@fnb/db/test-support";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { type ApiProcess, listeningUrl, spawnApi } from "../support/api-process";

const info = inject("testPostgres");
const API_DIRECTORY = fileURLToPath(new URL("../../..", import.meta.url));
const PRODUCTION = {
  FNB_ENV: "production",
  FNB_DATABASE_URL: testConnectionString(info, "app"),
  FNB_EINVOICE_PROVIDER: "none",
  FNB_ALLOWED_ORIGINS: "https://quan.example.vn",
  FNB_PAYMENT_SECRET_KEY: randomBytes(32).toString("base64"),
  FNB_TRUSTED_PROXIES: "127.0.0.1,::1",
  FNB_CLEANUP_ENABLED: "false",
  PORT: "0",
};
let api: ApiProcess;
let healthUrl: string;

beforeAll(async () => {
  api = spawnApi(PRODUCTION);
  healthUrl = `${await listeningUrl(api)}/health`;
});

afterAll(async () => {
  api.child.kill("SIGTERM");
  await api.exited;
});

function preflight(env: Record<string, string>) {
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/ops/preflight-cli.ts"], {
      cwd: API_DIRECTORY,
      env: { PATH: process.env.PATH ?? "", ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString("utf8")));
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, output }));
  });
}

const ready = () => ({
  ...PRODUCTION,
  FNB_ADMIN_DATABASE_URL: testConnectionString(info, "superuser", "postgres"),
  FNB_PREFLIGHT_HEALTH_URL: healthUrl,
});

it("passes a running production API on a migrated database, printing no secret", async () => {
  const { code, output } = await preflight(ready());
  expect(output).toContain("=> sẵn sàng mở cho quán");
  expect(output).not.toContain("KHÔNG ĐẠT");
  expect(code).toBe(0);
  for (const secret of [info.app.password, info.superuser.password]) {
    expect(output).not.toContain(secret);
  }
});

it("fails an API connected as a role that bypasses row level security", async () => {
  const { code, output } = await preflight({
    ...ready(),
    FNB_DATABASE_URL: testConnectionString(info, "superuser"),
  });
  expect(output).toContain("KHÔNG ĐẠT role database của API: là SUPERUSER hoặc BYPASSRLS");
  expect(code).toBe(1);
  expect(output).not.toContain(info.superuser.password);
});

it("fails when the API does not answer", async () => {
  const { code, output } = await preflight({
    ...ready(),
    FNB_PREFLIGHT_HEALTH_URL: "http://127.0.0.1:1/health",
  });
  expect(output).toContain("KHÔNG ĐẠT /health");
  expect(code).toBe(1);
});
