import { describe, expect, it } from "vitest";
import { type HttpResponse, createHttpSyncTransport } from "./http-sync-transport";
import { SyncTransportError } from "./sync-transport";

const GENERATION = "0192f5a4-7c3e-7d10-8b2a-3f9e1c4d5a6b";
const EMPTY_PAGE = JSON.stringify({ changes: [], nextCursor: "7" });

function transportAnswering(response: HttpResponse) {
  const paths: string[] = [];
  const transport = createHttpSyncTransport({
    send: async (request) => {
      paths.push(request.path);
      return response;
    },
    deviceToken: "device-token",
    staffSessionToken: () => null,
  });
  return { transport, paths };
}

const kindOf = (work: Promise<unknown>) =>
  work.then(
    () => null,
    (error: unknown) => (error instanceof SyncTransportError ? error.kind : error),
  );

describe("the server generation over HTTP", () => {
  it("comes with a pulled page from the header of the answer", async () => {
    const { transport } = transportAnswering({
      status: 200,
      body: EMPTY_PAGE,
      headers: { "x-fnb-server-generation": GENERATION },
    });
    expect(await transport.pullChanges("7", 10)).toEqual({
      changes: [],
      nextCursor: "7",
      serverGeneration: GENERATION,
    });
  });

  it("is absent from a page of a server that names none", async () => {
    const { transport } = transportAnswering({ status: 200, body: EMPTY_PAGE });
    expect(await transport.pullChanges("7", 10)).toEqual({ changes: [], nextCursor: "7" });
  });

  it("refuses a page whose generation is not an id", async () => {
    const { transport } = transportAnswering({
      status: 200,
      body: EMPTY_PAGE,
      headers: { "x-fnb-server-generation": "yesterday" },
    });
    expect(await kindOf(transport.pullChanges("7", 10))).toBe("protocol");
  });
});

describe("the till's device state over HTTP", () => {
  it("asks GET /sync/device-state and reads the generation and last device_seq", async () => {
    const body = JSON.stringify({ serverGeneration: GENERATION, lastDeviceSeq: 4, later: true });
    const { transport, paths } = transportAnswering({ status: 200, body });
    expect(await transport.deviceState()).toEqual({
      serverGeneration: GENERATION,
      lastDeviceSeq: 4,
    });
    expect(paths).toEqual(["/sync/device-state"]);
  });

  it.each([
    ["a negative device_seq", { serverGeneration: GENERATION, lastDeviceSeq: -1 }],
    ["no generation", { lastDeviceSeq: 4 }],
  ])("refuses an answer with %s", async (_label, answer) => {
    const { transport } = transportAnswering({ status: 200, body: JSON.stringify(answer) });
    expect(await kindOf(transport.deviceState())).toBe("protocol");
  });

  it("reports an answer other than 200 as http", async () => {
    const { transport } = transportAnswering({ status: 401, body: "{}" });
    expect(await kindOf(transport.deviceState())).toBe("http");
  });
});
