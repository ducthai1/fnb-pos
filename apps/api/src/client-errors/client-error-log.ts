import type { ScrubbedClientError } from "./scrub-client-error";

/**
 * Who reported: ids only. A device id names a till, an account id a backoffice sign-in;
 * neither says who the person is, and no staff or customer name ever reaches this log.
 */
export interface ClientErrorSource {
  readonly tenantId: string;
  readonly deviceId: string | null;
  readonly accountId: string | null;
}

export interface ClientErrorEntry {
  readonly source: ClientErrorSource;
  readonly report: ScrubbedClientError;
}

/** The entry as the lines a log keeps, shaped like a server fault: what failed, then where. */
export function clientErrorLines({ source, report }: ClientErrorEntry): string[] {
  const who =
    source.deviceId === null ? `account=${source.accountId}` : `device=${source.deviceId}`;
  const route = report.route === null ? "" : ` route=${report.route}`;
  const head =
    `client error: ${report.app} ${report.appVersion} ${report.kind} tenant=${source.tenantId} ` +
    `${who}${route} at=${report.occurredAt}: ${report.message}`;
  const frames = (report.stack ?? "").split("\n").filter((line) => /^\s+at /.test(line));
  return [head, ...frames];
}
