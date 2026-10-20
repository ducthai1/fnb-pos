import { newId } from "@fnb/db";
import type { FastifyInstance } from "fastify";

type Method = "GET" | "PUT" | "POST" | "DELETE";

/** A backoffice route called in process, as the signed-in owner, failing loudly when refused. */
export type BackofficeCall = <T = unknown>(
  method: Method,
  url: string,
  payload?: object,
  expected?: number,
) => Promise<T>;

export function backofficeCaller(app: FastifyInstance, cookie: string): BackofficeCall {
  return async <T>(method: Method, url: string, payload?: object, expected?: number) => {
    const response = await app.inject({
      method,
      url,
      headers: { cookie },
      ...(payload === undefined ? {} : { payload }),
    });
    const ok =
      expected === undefined ? response.statusCode < 300 : response.statusCode === expected;
    if (!ok) throw new Error(`${method} ${url} answered ${response.statusCode}: ${response.body}`);
    return (response.body === "" ? null : response.json()) as T;
  };
}

/**
 * The id of each named row, creating through `put` the ones a listing does not have yet:
 * the seed's way of running again without making anything twice.
 */
export async function ensureNamed<Item extends { name: string }>(
  call: BackofficeCall,
  listUrl: string,
  items: readonly Item[],
  put: (id: string, item: Item) => Promise<unknown>,
): Promise<Map<string, string>> {
  const listed = await call<{ id: string; name: string }[]>("GET", listUrl);
  const ids = new Map(listed.map((row) => [row.name, row.id]));
  for (const item of items) {
    if (ids.has(item.name)) continue;
    const id = newId();
    await put(id, item);
    ids.set(item.name, id);
  }
  return ids;
}
