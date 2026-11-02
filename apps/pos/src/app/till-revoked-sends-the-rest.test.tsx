import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { SyncTransportError } from "@fnb/sync-client";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import {
  CREDENTIAL,
  draftCommand,
  fakeDependencies,
  memoryCredentials,
} from "../test-support/fake-pos-server";
import { cafeServer, signedInTill } from "../test-support/signed-in-till";

const T = text.revoked.flush;
const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));

/** A signed-in till that the server then revokes, holding `count` unsent drafts. */
async function revokedHolding(count: number) {
  const server = cafeServer();
  const credentials = memoryCredentials(CREDENTIAL);
  const deps = fakeDependencies(server, { credentials: credentials.store });
  await signedInTill(server, { deps });
  const store = await deps.store;
  server.state.deviceRevoked = true;
  const drafts = [];
  for (let i = 0; i < count; i++) {
    const draft = draftCommand();
    drafts.push(draft);
    await store.enqueue(draft);
  }
  await screen.findByRole("heading", { name: text.revoked.title });
  await screen.findByText(text.revoked.waiting(count));
  return { server, credentials, store, drafts };
}

async function sendWithCode(code: string, count: number) {
  tap(T.open(count));
  const field = await screen.findByLabelText(T.codeLabel);
  fireEvent.change(field, { target: { value: code } });
  tap(T.submit(count));
}

describe("a revoked till sending the rest under a manager's code", () => {
  it("sends everything, says so, and then pairs again with nothing left to wipe", async () => {
    const { server, credentials, store } = await revokedHolding(2);
    server.state.flushCodes.add("ABCD2345");
    const pushedBefore = server.state.pushedWith.length;
    await sendWithCode("abcd-2345", 2);
    expect(await screen.findByText(T.sent(2))).toBeTruthy();
    expect(screen.getByText(text.revoked.nothingWaiting)).toBeTruthy();
    expect(await store.pendingCount()).toBe(0);
    expect(server.state.flushes.map((f) => [f.code, f.final, f.commands.length])).toEqual([
      ["ABCD2345", true, 2],
    ]);
    // Nothing the usual push sent: the staff credential is never used while revoked.
    expect(server.state.pushedWith).toHaveLength(pushedBefore);
    tap(text.revoked.pair);
    expect(await screen.findByLabelText(text.pairing.codeLabel)).toBeTruthy();
    expect(credentials.saved()).toBeNull();
  });

  it("lists what the server refused, with why, and counts it in what pairing again would wipe", async () => {
    const { server, store } = await revokedHolding(2);
    server.state.flushCodes.add("ABCD2345");
    server.state.refuseTypes.set("order.save_draft", "SYNC_ORDER_NOT_FOUND");
    await sendWithCode("ABCD2345", 2);
    const list = await screen.findByRole("region", { name: text.revoked.refusedList });
    expect(within(list).getAllByText("Lưu đơn")).toHaveLength(2);
    expect(within(list).getAllByText(text.errors.SYNC_ORDER_NOT_FOUND)).toHaveLength(2);
    expect(screen.getByText(text.revoked.refusedTitle(2))).toBeTruthy();
    expect(await store.pendingCount()).toBe(0);
    expect(await store.rejectedCommands()).toHaveLength(2);
    tap(text.revoked.pair);
    expect(screen.getByRole("button", { name: text.revoked.confirmDelete(2) })).toBeTruthy();
  });

  it("refuses a short code at once, and a wrong or spent one with the manager's next step", async () => {
    const { server, store } = await revokedHolding(1);
    await sendWithCode("ABC", 1);
    expect(await screen.findByText(T.codeIncomplete)).toBeTruthy();
    expect(server.state.flushes).toEqual([]);
    fireEvent.change(screen.getByLabelText(T.codeLabel), { target: { value: "ZZZZ9999" } });
    tap(T.submit(1));
    expect(await screen.findByText(T.invalid)).toBeTruthy();
    expect(await store.pendingCount()).toBe(1);
    expect(screen.getByText(T.nothingSent)).toBeTruthy();
  });

  it("keeps what the network cut off on the till, and the same code sends it once back online", async () => {
    const { server, store } = await revokedHolding(2);
    server.state.flushCodes.add("ABCD2345");
    server.state.online = false;
    await sendWithCode("ABCD2345", 2);
    expect(await screen.findByText(T.offline)).toBeTruthy();
    expect(await store.pendingCount()).toBe(2);
    server.state.online = true;
    tap(T.submit(2));
    expect(await screen.findByText(T.sent(2))).toBeTruthy();
    expect(await store.pendingCount()).toBe(0);
  });

  it("after a partial send, still lists and counts what did not go before wiping", async () => {
    const { server, store, drafts } = await revokedHolding(150);
    server.state.flushCodes.add("ABCD2345");
    const realPush = server.transport.pushCommands.bind(server.transport);
    let batches = 0;
    // The first batch is answered, then the network drops before the second.
    server.transport.pushCommands = async (batch) => {
      batches += 1;
      const answered = await realPush(batch);
      if (batches === 1) server.state.online = false;
      return answered;
    };
    await sendWithCode("ABCD2345", 150);
    expect(await screen.findByText(T.offline, undefined, { timeout: 3_000 })).toBeTruthy();
    expect(screen.getByText(T.sent(100))).toBeTruthy();
    await waitFor(() => expect(screen.getByText(text.revoked.waiting(50))).toBeTruthy());
    const left = await store.pendingCommands(1_000);
    expect(left.map((c) => c.commandId)).toEqual(drafts.slice(100).map((d) => d.commandId));
    tap(T.back);
    tap(text.revoked.pair);
    expect(screen.getByRole("button", { name: text.revoked.confirmDelete(50) })).toBeTruthy();
  });

  it("is told when the server says the till is not revoked after all", async () => {
    const { server } = await revokedHolding(1);
    server.state.flushCodes.add("ABCD2345");
    // A till paired again in the meantime, or a credential the server says is live.
    server.state.flushRefusal = new SyncTransportError(
      "http",
      409,
      "answered 409",
      "API_DEVICE_NOT_REVOKED",
    );
    await sendWithCode("ABCD2345", 1);
    expect(await screen.findByText(T.notRevoked)).toBeTruthy();
  });
});
