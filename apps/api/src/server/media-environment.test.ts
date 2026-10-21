import { describe, expect, it } from "vitest";
import { DEVELOPMENT_MEDIA_DIRECTORY } from "./media-environment";
import { readServerConfig } from "./server-config";

const base = {
  FNB_DATABASE_URL: "postgresql://fnb_app:x@127.0.0.1:5432/fnb",
  FNB_EINVOICE_PROVIDER: "none",
  FNB_ALLOWED_ORIGINS: "https://quan.example.vn",
};

const mediaOf = (env: Record<string, string>) => {
  const result = readServerConfig(env);
  return result.ok ? { directory: result.config.mediaDirectory } : { problems: result.problems };
};

describe("where product photos are kept", () => {
  it("is the directory production names, and production must name one", () => {
    expect(
      mediaOf({ ...base, FNB_ENV: "production", FNB_MEDIA_DIR: "/var/lib/fnb/media" }),
    ).toEqual({ directory: "/var/lib/fnb/media" });
    expect(mediaOf({ ...base, FNB_ENV: "production" })).toEqual({
      problems: ["FNB_MEDIA_DIR is required in production: where product photos are kept"],
    });
  });

  it("falls back to the repository's tmp/media in development only", () => {
    expect(mediaOf({ ...base, FNB_ENV: "development" })).toEqual({
      directory: DEVELOPMENT_MEDIA_DIRECTORY,
    });
    expect(DEVELOPMENT_MEDIA_DIRECTORY).toMatch(/\/tmp\/media$/);
    expect(DEVELOPMENT_MEDIA_DIRECTORY).not.toMatch(/apps\/api/);
  });

  it("refuses a relative path, which would depend on where the process was started", () => {
    expect(mediaOf({ ...base, FNB_ENV: "development", FNB_MEDIA_DIR: "tmp/media" })).toEqual({
      problems: ["FNB_MEDIA_DIR must be an absolute directory path"],
    });
  });
});
