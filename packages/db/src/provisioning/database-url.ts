/**
 * The same server as `url`, with another database and, when given, other credentials.
 * Credentials are percent-encoded by the URL setters, so passwords may hold any character.
 */
export function databaseUrlFor(
  url: string,
  change: { database?: string; credentials?: { user: string; password: string } },
): string {
  const parsed = new URL(url);
  if (change.database !== undefined) parsed.pathname = `/${encodeURIComponent(change.database)}`;
  if (change.credentials !== undefined) {
    parsed.username = change.credentials.user;
    parsed.password = change.credentials.password;
  }
  return parsed.toString();
}
