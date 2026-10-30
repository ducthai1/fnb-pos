import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { orderCommand, testId } from "../local-store/local-store-test-support";
import { type HttpRequest, createHttpSyncTransport, fetchHttpSend } from "./http-sync-transport";
import { SyncTransportError } from "./sync-transport";

const local = orderCommand(testId());
const envelope = {
  commandId: local.commandId,
  deviceSeq: 1,
  type: local.type,
  payload: local.payload,
  businessDate: local.businessDate,
  domainVersion: local.domainVersion,
  createdAt: local.createdAt,
};

function transportAnswering(
  status: number,
  body: string,
  staff: string | null = "staff-token",
  headers: Record<string, string> = {},
) {
  const requests: HttpRequest[] = [];
  const transport = createHttpSyncTransport({
    send: async (request) => {
      requests.push(request);
      return { status, body, headers };
    },
    deviceToken: "device-token",
    staffSessionToken: () => staff,
  });
  return { transport, requests };
}

const failureOf = (work: Promise<unknown>) =>
  work.then(
    () => null,
    (error: unknown) =>
      error instanceof SyncTransportError ? { kind: error.kind, status: error.status } : error,
  );

describe("the sync endpoints over HTTP", () => {
  it("pushes as the till and its signed-in staff member, and reads the answers", async () => {
    const result = { commandId: envelope.commandId, status: "accepted" };
    const { transport, requests } = transportAnswering(200, JSON.stringify({ results: [result] }));
    expect(await transport.pushCommands([envelope])).toEqual({ results: [result] });
    expect(requests).toEqual([
      {
        method: "POST",
        path: "/sync/commands",
        headers: {
          authorization: "Device device-token",
          "content-type": "application/json",
          // It says which optional fields of an answer it can read.
          "x-fnb-sync-features": "shift-version",
          "x-staff-session": "staff-token",
        },
        body: JSON.stringify({ commands: [envelope] }),
      },
    ]);
  });

  it("pulls with the till's credential only, cursor and limit in the query", async () => {
    const { transport, requests } = transportAnswering(
      200,
      JSON.stringify({ changes: [], nextCursor: "12" }),
      null,
    );
    expect(await transport.pullChanges("12", 500)).toEqual({ changes: [], nextCursor: "12" });
    expect(requests[0]).toMatchObject({
      method: "GET",
      path: "/sync/changes?cursor=12&limit=500",
      headers: { authorization: "Device device-token" },
    });
  });

  it("reads the server's clock off a push and a pull, and refuses one that is not a number", async () => {
    const timed = { "x-fnb-server-time": "1792468800000" };
    const pushed = transportAnswering(200, JSON.stringify({ results: [] }), "s", timed);
    expect(await pushed.transport.pushCommands([envelope])).toEqual({
      results: [],
      serverTimeMs: 1_792_468_800_000,
    });
    const page = JSON.stringify({ changes: [], nextCursor: "0" });
    const pulled = transportAnswering(200, page, null, timed);
    expect((await pulled.transport.pullChanges("0", 10)).serverTimeMs).toBe(1_792_468_800_000);
    const garbled = transportAnswering(200, page, null, { "x-fnb-server-time": "soon" });
    expect(await failureOf(garbled.transport.pullChanges("0", 10))).toEqual({
      kind: "protocol",
      status: 200,
    });
  });

  it("tells an HTTP refusal from an answer that breaks the contract", async () => {
    expect(
      await failureOf(transportAnswering(401, "{}").transport.pushCommands([envelope])),
    ).toEqual({ kind: "http", status: 401 });
    const notJson = transportAnswering(200, "<html>").transport;
    expect(await failureOf(notJson.pullChanges("0", 10))).toEqual({
      kind: "protocol",
      status: 200,
    });
    const badResult = transportAnswering(200, JSON.stringify({ results: [{ status: "ok" }] }));
    expect(await failureOf(badResult.transport.pushCommands([envelope]))).toEqual({
      kind: "protocol",
      status: 200,
    });
    const unordered = JSON.stringify({
      changes: [
        { changeSeq: "2", entity: "order", entityId: testId(), snapshot: null },
        { changeSeq: "1", entity: "order", entityId: testId(), snapshot: null },
      ],
      nextCursor: "2",
    });
    expect(
      await failureOf(transportAnswering(200, unordered).transport.pullChanges("0", 10)),
    ).toEqual({ kind: "protocol", status: 200 });
  });

  it("reports no answer at all as a network failure", async () => {
    const transport = createHttpSyncTransport({
      send: async () => {
        throw new TypeError("fetch failed");
      },
      deviceToken: "device-token",
      staffSessionToken: () => null,
    });
    expect(await failureOf(transport.pullChanges("0", 10))).toEqual({
      kind: "network",
      status: null,
    });
  });

  it("sends through fetch to the base URL", async () => {
    const seen: {
      method: string | undefined;
      url: string | undefined;
      auth: string | undefined;
      body: string;
    }[] = [];
    const server = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk: Buffer) => (body += chunk.toString()));
      request.on("end", () => {
        seen.push({
          method: request.method,
          url: request.url,
          auth: request.headers.authorization,
          body,
        });
        response
          .writeHead(201, {
            "x-fnb-server-generation": "0192f5a4-7c3e-7d10-8b2a-3f9e1c4d5a6b",
            "x-fnb-server-time": "1792468800000",
          })
          .end("created");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const send = fetchHttpSend(`http://127.0.0.1:${port}/`);
      const answer = await send({
        method: "POST",
        path: "/sync/x",
        headers: { authorization: "a" },
        body: "{}",
      });
      expect(answer).toEqual({
        status: 201,
        body: "created",
        headers: {
          "x-fnb-server-generation": "0192f5a4-7c3e-7d10-8b2a-3f9e1c4d5a6b",
          "x-fnb-server-time": "1792468800000",
        },
      });
      expect(seen).toEqual([{ method: "POST", url: "/sync/x", auth: "a", body: "{}" }]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe("naming the build and reading the refusal's code", () => {
  const withBuild = (answer: { status: number; body: string }) => {
    const requests: HttpRequest[] = [];
    const transport = createHttpSyncTransport({
      send: async (request) => {
        requests.push(request);
        return answer;
      },
      deviceToken: "device-token",
      staffSessionToken: () => "staff-token",
      posBuild: 1_761_800_000,
    });
    return { transport, requests };
  };

  it("names its build on every request, and none when it has none", async () => {
    const page = { status: 200, body: JSON.stringify({ changes: [], nextCursor: "0", hasMore: false }) };
    const { transport, requests } = withBuild(page);
    await transport.pullChanges("0", 10).catch(() => undefined);
    await transport.deviceState().catch(() => undefined);
    await transport.pushCommands([envelope]).catch(() => undefined);
    expect(requests.map((request) => request.headers["x-fnb-pos-build"])).toEqual([
      "1761800000",
      "1761800000",
      "1761800000",
    ]);
    const plain = transportAnswering(200, JSON.stringify({ results: [] }));
    await plain.transport.pushCommands([envelope]);
    expect(plain.requests[0]?.headers).not.toHaveProperty("x-fnb-pos-build");
  });

  it("carries the code of an error answer, so two kinds of 401 can be told apart", async () => {
    const codeOf = async (status: number, body: string) => {
      const { transport } = transportAnswering(status, body);
      const error = await transport.pushCommands([envelope]).catch((caught: unknown) => caught);
      return error instanceof SyncTransportError ? [error.status, error.code] : error;
    };
    expect(await codeOf(426, '{"code":"API_POS_RELEASE_TOO_OLD"}')).toEqual([
      426,
      "API_POS_RELEASE_TOO_OLD",
    ]);
    expect(await codeOf(401, '{"code":"API_DEVICE_UNAUTHENTICATED"}')).toEqual([
      401,
      "API_DEVICE_UNAUTHENTICATED",
    ]);
    expect(await codeOf(502, "<html>bad gateway</html>")).toEqual([502, undefined]);
  });
});
