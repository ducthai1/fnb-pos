import type { buildApp } from "@fnb/api/build-app";
import type { HttpSend } from "../../src";

/** HttpSend straight into the API in this process, through Fastify's inject. */
export function injectHttpSend(app: ReturnType<typeof buildApp>): HttpSend {
  return async (request) => {
    const response = await app.inject({
      method: request.method,
      url: request.path,
      headers: request.headers,
      ...(request.body === undefined ? {} : { payload: request.body }),
    });
    const headers = Object.fromEntries(
      Object.entries(response.headers).map(([name, value]) => [name, String(value)]),
    );
    return { status: response.statusCode, body: response.body, headers };
  };
}
