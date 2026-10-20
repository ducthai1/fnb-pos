import { describe, expect, it } from "vitest";
import { readBackupSettings, readRestoreSettings } from "./backup-environment";

const SECRET = "S3cret-backup-pw";
const URL_WITH_PASSWORD = `postgresql://fnb_backup:${SECRET}@127.0.0.1:5432/fnb`;

describe("backup settings", () => {
  it("reads the database, the directory and how many backups to keep", () => {
    expect(
      readBackupSettings({
        FNB_BACKUP_DATABASE_URL: URL_WITH_PASSWORD,
        FNB_BACKUP_DIRECTORY: "/var/backups/fnb",
        FNB_BACKUP_KEEP: "7",
      }),
    ).toEqual({
      ok: true,
      value: { databaseUrl: URL_WITH_PASSWORD, directory: "/var/backups/fnb", keep: 7 },
    });
  });

  it("keeps two weeks of daily backups unless told otherwise", () => {
    const result = readBackupSettings({
      FNB_BACKUP_DATABASE_URL: "postgresql://fnb_backup@127.0.0.1/fnb",
      FNB_BACKUP_DIRECTORY: "/var/backups/fnb",
    });
    expect(result.ok && result.value.keep).toBe(14);
  });

  it("refuses a relative directory, a missing database name and keeping none", () => {
    const result = readBackupSettings({
      FNB_BACKUP_DATABASE_URL: `postgresql://fnb_backup:${SECRET}@127.0.0.1:5432`,
      FNB_BACKUP_DIRECTORY: "backups",
      FNB_BACKUP_KEEP: "0",
    });
    expect(result).toEqual({
      ok: false,
      problems: [
        "FNB_BACKUP_DATABASE_URL is not a postgres:// connection string with a user",
        "FNB_BACKUP_DIRECTORY must be an absolute path",
        "FNB_BACKUP_KEEP must be at least 1",
      ],
    });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });
});

describe("restore settings", () => {
  it("reads the admin connection and defaults the owner role", () => {
    expect(readRestoreSettings({ FNB_RESTORE_ADMIN_URL: URL_WITH_PASSWORD })).toEqual({
      ok: true,
      value: { adminUrl: URL_WITH_PASSWORD, ownerRole: "fnb_owner" },
    });
  });

  it("names what is missing", () => {
    expect(readRestoreSettings({ FNB_OWNER_ROLE: "Owner!" })).toEqual({
      ok: false,
      problems: [
        "FNB_RESTORE_ADMIN_URL is required: a role that may create databases, on database postgres",
        "FNB_OWNER_ROLE must be a lower-case Postgres role name",
      ],
    });
  });
});
