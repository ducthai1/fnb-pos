/**
 * `__Host-` makes the browser refuse the cookie unless it is Secure, has Path=/ and no
 * Domain, so a sibling subdomain can neither set nor overwrite it. HttpOnly keeps it from
 * scripts; SameSite=Lax keeps it off cross-site POSTs while a link to the backoffice still
 * arrives signed in.
 */
export const SESSION_COOKIE = "__Host-fnb_session";

/**
 * The name used when the server is told its cookies may travel over plain HTTP (a machine
 * on the shop's network without TLS). `__Host-` cannot go without Secure, so the cookie
 * gets another name, which also means an insecure cookie is never read as the secure one.
 */
export const INSECURE_SESSION_COOKIE = "fnb_session";

export interface SessionCookieJar {
  readonly name: string;
  set(token: string, maxAgeSeconds: number): string;
  cleared(): string;
  /** The session token from a Cookie header, or null. */
  read(cookieHeader: string | undefined): string | null;
}

export function sessionCookieJar(options: { secure: boolean }): SessionCookieJar {
  const name = options.secure ? SESSION_COOKIE : INSECURE_SESSION_COOKIE;
  const attributes = `Path=/; HttpOnly;${options.secure ? " Secure;" : ""} SameSite=Lax`;
  return {
    name,
    set: (token, maxAgeSeconds) => `${name}=${token}; ${attributes}; Max-Age=${maxAgeSeconds}`,
    cleared: () => `${name}=; ${attributes}; Max-Age=0`,
    read: (cookieHeader) => readCookie(cookieHeader, name),
  };
}

function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (cookieHeader === undefined) return null;
  for (const pair of cookieHeader.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() !== name) continue;
    const value = pair.slice(separator + 1).trim();
    return value === "" ? null : value;
  }
  return null;
}
