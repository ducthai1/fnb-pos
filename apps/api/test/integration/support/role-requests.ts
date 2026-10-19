import type { FastifyInstance } from "fastify";

async function call(
  app: FastifyInstance,
  cookie: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  payload?: object,
) {
  const response = await app.inject({
    method,
    url,
    headers: { cookie },
    ...(payload === undefined ? {} : { payload }),
  });
  return { status: response.statusCode, body: response.body === "" ? null : response.json() };
}

export const listRoles = (app: FastifyInstance, cookie: string) =>
  call(app, cookie, "GET", "/roles");

export const postRole = (app: FastifyInstance, cookie: string, body: object) =>
  call(app, cookie, "POST", "/roles", body);

export const patchRole = (app: FastifyInstance, cookie: string, id: string, body: object) =>
  call(app, cookie, "PATCH", `/roles/${id}`, body);

export const deleteRole = (app: FastifyInstance, cookie: string, id: string) =>
  call(app, cookie, "DELETE", `/roles/${id}`);
