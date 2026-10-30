import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DEVELOPMENT_MEDIA_DIRECTORY } from "./media-environment";
import { readServerConfig } from "./server-config";

const PASSWORD = "s3cret-Pa55word";
const DATABASE_URL = `postgresql://fnb_app:${PASSWORD}@127.0.0.1:5432/fnb`;
const KEY = randomBytes(32).toString("base64");

const development = { FNB_ENV: "development", FNB_DATABASE_URL: DATABASE_URL };
const production = {
  FNB_ENV: "production",
  FNB_DATABASE_URL: DATABASE_URL,
  FNB_EINVOICE_PROVIDER: "none",
  FNB_ALLOWED_ORIGINS: "https://pos.example.vn,https://admin.example.vn",
  FNB_MEDIA_DIR: "/var/lib/fnb/media",
};

function problemsOf(env: Record<string, string>): readonly string[] {
  const result = readServerConfig(env);
  if (result.ok) throw new Error("expected the configuration to be refused");
  return result.problems;
}

describe("server configuration", () => {
  it("talks to ZaloPay's production in production, its sandbox elsewhere unless told", () => {
    const configOf = (env: Record<string, string>) => {
      const result = readServerConfig(env);
      if (!result.ok) throw new Error(result.problems.join("; "));
      return result.config;
    };
    expect(configOf(development).zaloPayEnvironment).toBe("sandbox");
    expect(configOf({ ...development, FNB_ZALOPAY_ENV: "production" }).zaloPayEnvironment).toBe(
      "production",
    );
    expect(
      configOf({ ...development, FNB_PUBLIC_API_URL: "https://pos.example.vn" }).walletCallbackBase,
    ).toBe("https://pos.example.vn");
    expect(problemsOf({ ...development, FNB_PUBLIC_API_URL: "http://pos.example.vn" })).toEqual([
      "FNB_PUBLIC_API_URL must be an https origin",
    ]);
  });

  it("starts development with the fake invoice provider and secure cookies", () => {
    const result = readServerConfig(development);
    expect(result).toEqual({
      ok: true,
      config: {
        environment: "development",
        host: "127.0.0.1",
        port: 3000,
        databaseUrl: DATABASE_URL,
        paymentSecretKey: null,
        zaloPayEnvironment: "sandbox",
        walletCallbackBase: null,
        walletPollIntervalMs: 5_000,
        einvoiceProvider: "fake",
        einvoiceWorkerIntervalMs: 5_000,
        secureCookies: true,
        allowedOrigins: null,
        rateLimits: {
          windowMillis: 60_000,
          loginPerAddress: 30,
          loginPerAccount: 10,
          pairingPerAddress: 10,
          tillPerAddress: 300,
          tillPerDevice: 60,
          trustedProxies: [],
        },
        cleanup: { intervalMillis: 3_600_000, sessionRetentionMillis: 30 * 86_400_000 },
        mediaDirectory: DEVELOPMENT_MEDIA_DIRECTORY,
        minimumPosBuild: null,
      },
    });
  });

  it("reads the oldest POS build to serve, and refuses what is not a build number", () => {
    const result = readServerConfig({ ...development, FNB_MIN_POS_BUILD: "1761800000" });
    expect(result.ok && result.config.minimumPosBuild).toBe(1_761_800_000);
    expect(problemsOf({ ...development, FNB_MIN_POS_BUILD: "0.0.0+abc1234" })).toEqual([
      "FNB_MIN_POS_BUILD must be a whole number: the build of the oldest POS to serve",
    ]);
    expect(problemsOf({ ...development, FNB_MIN_POS_BUILD: "0" })).toEqual([
      "FNB_MIN_POS_BUILD must be at least 1",
    ]);
  });

  it("reads the cleanup job's schedule and retention, or leaves it off", () => {
    const result = readServerConfig({
      ...development,
      FNB_CLEANUP_INTERVAL_MINUTES: "15",
      FNB_SESSION_RETENTION_DAYS: "7",
    });
    expect(result.ok && result.config.cleanup).toEqual({
      intervalMillis: 900_000,
      sessionRetentionMillis: 7 * 86_400_000,
    });
    const off = readServerConfig({ ...development, FNB_CLEANUP_ENABLED: "false" });
    expect(off.ok && off.config.cleanup).toBeNull();
  });

  it("refuses a retention of no days, which would delete sessions as they expire", () => {
    expect(
      problemsOf({ ...development, FNB_SESSION_RETENTION_DAYS: "0", FNB_CLEANUP_ENABLED: "yes" }),
    ).toEqual([
      "FNB_CLEANUP_ENABLED must be true or false",
      "FNB_SESSION_RETENTION_DAYS must be at least 1",
    ]);
  });

  it("reads the rate limits and the proxies whose forwarded address is believed", () => {
    const result = readServerConfig({
      ...development,
      FNB_RATE_LIMIT_WINDOW_SECONDS: "120",
      FNB_RATE_LIMIT_LOGIN_PER_ADDRESS: "5",
      FNB_RATE_LIMIT_LOGIN_PER_ACCOUNT: "3",
      FNB_RATE_LIMIT_PAIRING_PER_ADDRESS: "2",
      FNB_RATE_LIMIT_TILL_PER_ADDRESS: "50",
      FNB_RATE_LIMIT_TILL_PER_DEVICE: "20",
      FNB_TRUSTED_PROXIES: "127.0.0.1, ::1",
    });
    if (!result.ok) throw new Error(result.problems.join("\n"));
    expect(result.config.rateLimits).toEqual({
      windowMillis: 120_000,
      loginPerAddress: 5,
      loginPerAccount: 3,
      pairingPerAddress: 2,
      tillPerAddress: 50,
      tillPerDevice: 20,
      trustedProxies: ["127.0.0.1", "::1"],
    });
  });

  it("refuses a rate limit of zero, which would lock everyone out, and a proxy by name", () => {
    expect(
      problemsOf({
        ...development,
        FNB_RATE_LIMIT_LOGIN_PER_ACCOUNT: "0",
        FNB_RATE_LIMIT_WINDOW_SECONDS: "1.5",
        FNB_TRUSTED_PROXIES: "localhost",
      }),
    ).toEqual([
      "FNB_RATE_LIMIT_WINDOW_SECONDS must be a whole number of seconds",
      "FNB_RATE_LIMIT_LOGIN_PER_ACCOUNT must be at least 1",
      "FNB_TRUSTED_PROXIES must be a comma separated list of addresses or ranges such as 127.0.0.1,::1",
    ]);
  });

  it("reads every setting a production deployment names", () => {
    const result = readServerConfig({ ...production, PORT: "8080", FNB_PAYMENT_SECRET_KEY: KEY });
    if (!result.ok) throw new Error(result.problems.join("\n"));
    expect(result.config.port).toBe(8080);
    expect(result.config.einvoiceProvider).toBe("none");
    expect(result.config.paymentSecretKey).toEqual(Buffer.from(KEY, "base64"));
    expect(result.config.allowedOrigins).toEqual([
      "https://pos.example.vn",
      "https://admin.example.vn",
    ]);
  });

  it("refuses to guess the environment", () => {
    expect(problemsOf({ FNB_DATABASE_URL: DATABASE_URL })).toEqual([
      "FNB_ENV must be development or production",
    ]);
  });

  it("names a missing database and an empty one alike", () => {
    expect(problemsOf({ FNB_ENV: "development" })).toEqual([
      "FNB_DATABASE_URL is required: the app role's postgres:// connection string",
    ]);
    expect(problemsOf({ FNB_ENV: "development", FNB_DATABASE_URL: "" })).toEqual([
      "FNB_DATABASE_URL is required: the app role's postgres:// connection string",
    ]);
  });

  it("never repeats a refused value, which may be a secret", () => {
    const problems = problemsOf({
      FNB_ENV: "development",
      FNB_DATABASE_URL: `mysql://fnb_app:${PASSWORD}@db/fnb`,
      FNB_PAYMENT_SECRET_KEY: `${PASSWORD}${PASSWORD}`,
      FNB_EINVOICE_PROVIDER: PASSWORD,
      FNB_COOKIE_SECURE: PASSWORD,
      PORT: PASSWORD,
      FNB_ALLOWED_ORIGINS: PASSWORD,
    });
    expect(problems).toHaveLength(6);
    for (const problem of problems) expect(problem).not.toContain(PASSWORD.slice(0, 6));
    expect(problems.map((problem) => problem.split(" ")[0]).sort()).toEqual([
      "FNB_ALLOWED_ORIGINS",
      "FNB_COOKIE_SECURE",
      "FNB_DATABASE_URL",
      "FNB_EINVOICE_PROVIDER",
      "FNB_PAYMENT_SECRET_KEY",
      "PORT",
    ]);
  });

  it("makes production name its invoice provider and origins", () => {
    expect(problemsOf({ FNB_ENV: "production", FNB_DATABASE_URL: DATABASE_URL })).toEqual([
      "FNB_EINVOICE_PROVIDER is required in production: name the provider or none",
      "FNB_ALLOWED_ORIGINS is required in production",
      "FNB_MEDIA_DIR is required in production: where product photos are kept",
    ]);
  });

  it("refuses the fake provider and insecure cookies in production only", () => {
    expect(
      problemsOf({ ...production, FNB_EINVOICE_PROVIDER: "fake", FNB_COOKIE_SECURE: "false" }),
    ).toEqual([
      "FNB_EINVOICE_PROVIDER cannot be fake in production: its invoices exist nowhere",
      "FNB_COOKIE_SECURE cannot be false in production",
    ]);
    const result = readServerConfig({ ...development, FNB_COOKIE_SECURE: "false" });
    expect(result.ok && result.config.secureCookies).toBe(false);
  });

  it("refuses an origin with a path, which a browser never sends", () => {
    expect(problemsOf({ ...production, FNB_ALLOWED_ORIGINS: "https://pos.example.vn/" })).toEqual([
      "FNB_ALLOWED_ORIGINS must be a comma separated list of origins such as https://pos.example.vn",
    ]);
  });
});
