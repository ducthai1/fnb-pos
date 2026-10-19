import { syncChangesPageSchema, syncCommandResultSchema } from "@fnb/contracts";
import type { SyncCommandResult } from "@fnb/contracts";
import { SyncTransportError, type SyncTransport } from "./sync-transport";

export interface HttpRequest {
  readonly method: "GET" | "POST";
  /** Path and query, e.g. "/sync/changes?cursor=0&limit=500". */
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

export interface HttpResponse {
  readonly status: number;
  readonly body: string;
}

/** Sends one request; throws only when no answer came back. */
export type HttpSend = (request: HttpRequest) => Promise<HttpResponse>;

export interface HttpSyncTransportOptions {
  send: HttpSend;
  /** The till's credential from pairing. */
  deviceToken: string;
  /** The staff member signed in on the till, read per push: commands are recorded as theirs. */
  staffSessionToken: () => string | null;
}

const STAFF_SESSION_HEADER = "x-staff-session";

function bodyOf(response: HttpResponse): unknown {
  if (response.status !== 200) {
    throw new SyncTransportError("http", response.status, `answered ${response.status}`);
  }
  try {
    return JSON.parse(response.body);
  } catch {
    throw new SyncTransportError("protocol", 200, "answer is not JSON");
  }
}

const protocolError = (what: string) => new SyncTransportError("protocol", 200, what);

/** The sync endpoints over HTTP, every answer checked against the contracts before use. */
export function createHttpSyncTransport(options: HttpSyncTransportOptions): SyncTransport {
  const authorization = `Device ${options.deviceToken}`;
  const send = async (request: HttpRequest) => {
    try {
      return await options.send(request);
    } catch (error) {
      throw new SyncTransportError("network", null, String(error));
    }
  };
  return {
    async pushCommands(commands) {
      const staff = options.staffSessionToken();
      const response = await send({
        method: "POST",
        path: "/sync/commands",
        headers: {
          authorization,
          "content-type": "application/json",
          ...(staff === null ? {} : { [STAFF_SESSION_HEADER]: staff }),
        },
        body: JSON.stringify({ commands }),
      });
      const results = (bodyOf(response) as { results?: unknown } | null)?.results;
      if (!Array.isArray(results)) throw protocolError("no results in the answer");
      return results.map((result): SyncCommandResult => {
        const parsed = syncCommandResultSchema.safeParse(result);
        if (!parsed.success) throw protocolError("a result breaks the contract");
        return parsed.data;
      });
    },
    async pullChanges(cursor, limit) {
      const query = new URLSearchParams({ cursor, limit: String(limit) });
      const response = await send({
        method: "GET",
        path: `/sync/changes?${query.toString()}`,
        headers: { authorization },
      });
      const parsed = syncChangesPageSchema.safeParse(bodyOf(response));
      if (!parsed.success) throw protocolError("the page breaks the contract");
      return parsed.data;
    },
  };
}

/** HttpSend over fetch, for a till talking to the real API. */
export function fetchHttpSend(
  baseUrl: string,
  options: { fetch?: typeof fetch; timeoutMs?: number } = {},
): HttpSend {
  const doFetch = options.fetch ?? fetch;
  const base = baseUrl.replace(/\/+$/, "");
  return async (request) => {
    const response = await doFetch(`${base}${request.path}`, {
      method: request.method,
      headers: request.headers,
      ...(request.body === undefined ? {} : { body: request.body }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    });
    return { status: response.status, body: await response.text() };
  };
}
