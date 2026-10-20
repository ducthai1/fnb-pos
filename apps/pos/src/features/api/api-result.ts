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

export interface JsonAnswer {
  readonly status: number | null;
  readonly body: unknown;
}

/** One JSON request. Never throws: a dropped connection or a timeout is status null. */
export async function requestJson(
  fetchImpl: FetchLike,
  url: string,
  init: { method: "GET" | "POST"; headers?: Record<string, string>; body?: unknown },
): Promise<JsonAnswer> {
  try {
    const response = await fetchImpl(url, {
      method: init.method,
      headers: {
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        ...init.headers,
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(10_000),
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

/** The string fields `keys` of a JSON object, or null if any is missing or not a string. */
export function stringFields<K extends string>(
  body: unknown,
  keys: readonly K[],
): Record<K, string> | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  const picked = {} as Record<K, string>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== "string" || value === "") return null;
    picked[key] = value;
  }
  return picked;
}
