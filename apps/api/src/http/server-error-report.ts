/**
 * What the server keeps of a request it failed with a 500: the method, the route pattern
 * (never the URL, whose query may carry values), the error's code (a SQLSTATE or the
 * thrower's) and its message and stack with secrets masked. Never the body or headers: a
 * PIN, a password, a session cookie or a device token travel there.
 */
export interface ServerErrorReport {
  readonly method: string;
  readonly route: string;
  readonly code: string | null;
  readonly message: string;
  readonly stack: string | null;
}

const MASK = "***";

// user:password@ in any URL, a database connection string first among them.
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s:@/]+:[^\s@/]*@/gi;
// name=value or name: value, for any name that holds a credential.
const NAMED_SECRET =
  /\b([\w-]*(?:password|passwd|secret|token|session|cookie|authorization|api[_-]?key)[\w-]*|pin|pin_hash|pinhash)(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;&]+)/gi;
// A credential after its scheme, as an Authorization header carries it.
const SCHEME_CREDENTIAL = /\b(Bearer|Basic|Device)\s+[A-Za-z0-9._~+/=-]{8,}/g;

/** `text` with every credential in it replaced by ***. */
export function maskSecrets(text: string): string {
  // The scheme's credential goes first: "authorization: Device <token>" would otherwise
  // have only its first word, the scheme, masked as the header's value.
  return text
    .replace(URL_CREDENTIALS, `$1${MASK}@`)
    .replace(SCHEME_CREDENTIAL, `$1 ${MASK}`)
    .replace(NAMED_SECRET, `$1$2${MASK}`);
}

/** The report of `error`, thrown while serving `method` on `route`. */
export function serverErrorReport(
  method: string,
  route: string,
  error: unknown,
): ServerErrorReport {
  const thrown = error instanceof Error ? error : new Error(String(error));
  const code = (thrown as { code?: unknown }).code;
  return {
    method,
    route,
    code: typeof code === "string" || typeof code === "number" ? String(code) : null,
    message: maskSecrets(thrown.message),
    stack: thrown.stack === undefined ? null : maskSecrets(thrown.stack),
  };
}

/** The report as the lines a log keeps: what failed first, then where. */
export function serverErrorLines(report: ServerErrorReport): string[] {
  const code = report.code === null ? "" : ` [${report.code}]`;
  const head = `request failed: ${report.method} ${report.route} -> 500${code}: ${report.message}`;
  const frames = (report.stack ?? "").split("\n").filter((line) => /^\s+at /.test(line));
  return [head, ...frames];
}
