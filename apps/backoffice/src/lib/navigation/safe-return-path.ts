/**
 * Where to go after signing in: the page the person was sent away from, but only a path
 * of this site. `//evil.example` and `https://…` would turn the sign-in page into a
 * redirect to anywhere, so they fall back to the home page.
 */
export function safeReturnPath(next: string | null): string {
  if (next === null || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/";
  }
  if (next === "/login" || next.startsWith("/login?")) return "/";
  return next;
}
