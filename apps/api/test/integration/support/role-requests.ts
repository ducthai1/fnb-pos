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

/** The role's version as the list shows it now, or 1 for one the caller cannot see. */
async function versionOf(app: FastifyInstance, cookie: string, id: string): Promise<number> {
  const listed = await listRoles(app, cookie);
  const roles = ((listed.body as { roles?: { id: string; version: number }[] } | null)?.roles ??
    []) as { id: string; version: number }[];
  return roles.find((role) => role.id === id)?.version ?? 1;
}

/** Changes the role as of `version`, or as of its current one when none is named. */
export const patchRole = async (
  app: FastifyInstance,
  cookie: string,
  id: string,
  body: object,
  version?: number,
) =>
  call(
    app,
    cookie,
    "PATCH",
    `/roles/${id}?version=${version ?? (await versionOf(app, cookie, id))}`,
    body,
  );

/** Deletes the role as of `version`, or as of its current one when none is named. */
export const deleteRole = async (
  app: FastifyInstance,
  cookie: string,
  id: string,
  version?: number,
) =>
  call(
    app,
    cookie,
    "DELETE",
    `/roles/${id}?version=${version ?? (await versionOf(app, cookie, id))}`,
  );

/** Puts the role away as of `version`, or as of its current one when none is named. */
export const archiveRoleAt = async (
  app: FastifyInstance,
  cookie: string,
  id: string,
  version?: number,
) =>
  call(
    app,
    cookie,
    "POST",
    `/roles/${id}/archive?version=${version ?? (await versionOf(app, cookie, id))}`,
  );
