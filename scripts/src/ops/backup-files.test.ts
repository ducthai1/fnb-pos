import { describe, expect, it } from "vitest";
import { backupFileName, backupsToDelete } from "./backup-files";
import { libpqEnvironment } from "./postgres-client-tools";

describe("backup file names", () => {
  it("carry the database and the UTC time, to the second", () => {
    expect(backupFileName("fnb", new Date("2026-10-21T02:35:07.123Z"))).toBe(
      "fnb-fnb-20261021T023507Z.dump",
    );
  });

  it("sort in the order the backups were taken", () => {
    const names = ["2026-12-31T23:59:59Z", "2027-01-01T00:00:00Z", "2026-02-03T04:05:06Z"].map(
      (time) => backupFileName("fnb", new Date(time)),
    );
    expect([...names].sort()).toEqual([names[2], names[0], names[1]]);
  });
});

describe("which backups rotation deletes", () => {
  const day = (n: number) => backupFileName("fnb", new Date(Date.UTC(2026, 9, n, 3)));

  it("keeps the newest ones and deletes the rest, oldest first", () => {
    const names = [day(3), day(1), day(5), day(2), day(4)];
    expect(backupsToDelete(names, "fnb", 3)).toEqual([day(1), day(2)]);
  });

  it("deletes nothing while there are no more than it keeps", () => {
    expect(backupsToDelete([day(1), day(2)], "fnb", 2)).toEqual([]);
  });

  it("never chooses another database's backups or a file it did not write", () => {
    const other = backupFileName("fnb_staging", new Date(Date.UTC(2026, 9, 1)));
    const names = [day(1), day(2), other, "notes.txt", `${day(0)}.partial`, "fnb-fnb-x.dump"];
    expect(backupsToDelete(names, "fnb", 1)).toEqual([day(1)]);
  });
});

describe("connection environment of the client tools", () => {
  it("moves the password out of the URL into PGPASSWORD", () => {
    expect(libpqEnvironment("postgresql://fnb_backup:p%40ss%2Fw0rd@db.local:5433/fnb")).toEqual({
      PGHOST: "db.local",
      PGPORT: "5433",
      PGUSER: "fnb_backup",
      PGDATABASE: "fnb",
      PGPASSWORD: "p@ss/w0rd",
    });
  });

  it("leaves the password to PGPASSFILE when the URL has none", () => {
    const env = libpqEnvironment("postgresql://postgres@127.0.0.1/postgres", "fnb_restored");
    expect(env).toEqual({ PGHOST: "127.0.0.1", PGUSER: "postgres", PGDATABASE: "fnb_restored" });
  });

  it("reaches a unix socket directory given as the host parameter", () => {
    const env = libpqEnvironment("postgresql://postgres@localhost/fnb?host=/var/run/postgresql");
    expect(env.PGHOST).toBe("/var/run/postgresql");
  });
});
