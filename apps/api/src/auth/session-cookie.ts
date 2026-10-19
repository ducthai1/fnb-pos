/**
 * `__Host-` makes the browser refuse the cookie unless it is Secure, has Path=/ and no
 * Domain, so a sibling subdomain can neither set nor overwrite it. HttpOnly keeps it from
 * scripts; SameSite=Lax keeps it off cross-site POSTs while a link to the backoffice still
 * arrives signed in.
 */
export const SESSION_COOKIE = "__Host-fnb_session";

const ATTRIBUTES = "Path=/; HttpOnly; Secure; SameSite=Lax";

export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${token}; ${ATTRIBUTES}; Max-Age=${maxAgeSeconds}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; ${ATTRIBUTES}; Max-Age=0`;
}

/** The session token from a Cookie header, or null. */
export function readSessionToken(cookieHeader: string | undefined): string | null {
  if (cookieHeader === undefined) return null;
  for (const pair of cookieHeader.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() !== SESSION_COOKIE) continue;
    const value = pair.slice(separator + 1).trim();
    return value === "" ? null : value;
  }
  return null;
}
