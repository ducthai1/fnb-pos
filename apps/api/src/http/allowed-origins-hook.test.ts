import Fastify from "fastify";
import { afterAll, describe, expect, it } from "vitest";
import { HTTP_ERROR_CODES, allowedOriginsHook } from "./allowed-origins-hook";

const app = Fastify();
app.addHook("onRequest", allowedOriginsHook(["http://127.0.0.1:5173"]));
const WRITES = ["POST", "PUT", "PATCH", "DELETE"] as const;
for (const method of WRITES)
  app.route({ method, url: "/write", handler: async () => ({ ok: true }) });
app.get("/read", async () => ({ ok: true }));
afterAll(() => app.close());

type Method = (typeof WRITES)[number] | "GET";
const send = (method: Method, url: string, origin?: string) =>
  app.inject({ method, url, headers: origin === undefined ? {} : { origin } });

describe("allowed origins", () => {
  it("takes a write from a listed origin", async () => {
    expect((await send("POST", "/write", "http://127.0.0.1:5173")).statusCode).toBe(200);
  });

  it("refuses a write from a page of another site", async () => {
    const response = await send("POST", "/write", "https://evil.example");
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ code: HTTP_ERROR_CODES.originNotAllowed });
  });

  // DELETE /roles/:id or /floor/... from a page of another site is as much a write as a POST.
  it.each(WRITES)(
    "refuses a %s from another site and takes it from a listed one",
    async (method) => {
      expect((await send(method, "/write", "https://evil.example")).statusCode).toBe(403);
      expect((await send(method, "/write", "http://127.0.0.1:5173")).statusCode).toBe(200);
    },
  );

  // What a sandboxed iframe or a page with Referrer-Policy no-referrer sends: still a page.
  it("refuses a write whose Origin is the opaque null", async () => {
    expect((await send("POST", "/write", "null")).statusCode).toBe(403);
  });

  it("refuses an origin that only starts like a listed one", async () => {
    expect((await send("POST", "/write", "http://127.0.0.1:51730")).statusCode).toBe(403);
  });

  it("takes a write without an Origin header, which no browser page sends", async () => {
    expect((await send("POST", "/write")).statusCode).toBe(200);
  });

  it("lets any page read", async () => {
    expect((await send("GET", "/read", "https://evil.example")).statusCode).toBe(200);
  });
});
