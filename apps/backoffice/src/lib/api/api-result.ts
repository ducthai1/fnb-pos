/** Why a call to the API did not give what was asked for. status null: no answer at all. */
export interface ApiFailure {
  readonly ok: false;
  readonly status: number | null;
  /** The API's error code (`{code}` body), when it sent one. */
  readonly code: string | null;
  readonly body: unknown;
}

export type ApiResult<T> = { readonly ok: true; readonly value: T } | ApiFailure;

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface JsonAnswer {
  readonly status: number | null;
  readonly body: unknown;
}

/**
 * One JSON request to the API on this origin. Never throws: a dropped connection or a
 * timeout is status null. The session cookie is HttpOnly and set by the API itself, so
 * the browser sends it on its own; nothing here reads or stores a token.
 */
export async function requestJson(
  fetchImpl: FetchLike,
  url: string,
  init: { method: HttpMethod; body?: unknown; bytes?: Blob },
): Promise<JsonAnswer> {
  try {
    const sent =
      init.bytes !== undefined
        ? { headers: { "content-type": init.bytes.type || "application/octet-stream" }, body: init.bytes }
        : init.body === undefined
          ? { headers: {} }
          : { headers: { "content-type": "application/json" }, body: JSON.stringify(init.body) };
    const response = await fetchImpl(url, {
      method: init.method,
      credentials: "same-origin",
      ...sent,
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text === "" ? null : JSON.parse(text);
    } catch {
      body = null;
    }
    return { status: response.status, body };
  } catch {
    return { status: null, body: null };
  }
}

const codeIn = (body: unknown): string | null => {
  const code = (body as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : null;
};

/** The answer as a result: `parse` turns a 2xx body into the value, null if it is not one. */
export function resultOf<T>(answer: JsonAnswer, parse: (body: unknown) => T | null): ApiResult<T> {
  const { status, body } = answer;
  if (status !== null && status >= 200 && status < 300) {
    const value = parse(body);
    if (value !== null) return { ok: true, value };
  }
  return { ok: false, status, code: codeIn(body), body };
}

/** For calls answered 204: any 2xx is success. */
export const noContent = (): true => true;
