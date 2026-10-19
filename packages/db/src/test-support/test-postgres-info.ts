export type TestRole = "superuser" | "owner" | "app";

export interface TestRoleCredentials {
  user: string;
  password: string;
}

/** Plain data, so a vitest global setup can hand it to test workers. */
export interface TestPostgresInfo {
  host: string;
  port: number;
  /** The migrated database shared by the integration tests. */
  database: string;
  /** Bootstrap superuser: creates databases and roles, nothing else. */
  superuser: TestRoleCredentials;
  /** Owns the schema and runs migrations. Not a superuser, so FORCE ROW LEVEL SECURITY binds it. */
  owner: TestRoleCredentials;
  /** What the API connects as: DML only, no BYPASSRLS. */
  app: TestRoleCredentials;
}

export function testConnectionString(
  info: TestPostgresInfo,
  role: TestRole,
  database: string = info.database,
): string {
  const { user, password } = info[role];
  return `postgresql://${user}:${password}@${info.host}:${info.port}/${database}`;
}
