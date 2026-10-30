import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import {
  CREDENTIAL,
  draftCommand,
  fakeDependencies,
  memoryCredentials,
  refusal,
} from "../test-support/fake-pos-server";
import { cafeServer, signedInTill } from "../test-support/signed-in-till";
import { PosApp } from "./pos-app";

const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));

function revokedTill() {
  const server = cafeServer();
  const credentials = memoryCredentials(CREDENTIAL);
  return { server, credentials, deps: fakeDependencies(server, { credentials: credentials.store }) };
}

describe("a till the server has revoked", () => {
  it("clears its data and pairing and asks for a new code, saying why, when nothing is unsent", async () => {
    const { server, credentials, deps } = revokedTill();
    await signedInTill(server, { deps });
    const store = await deps.store;
    server.state.deviceRevoked = true;

    expect(await screen.findByRole("heading", { name: text.revoked.title })).toBeTruthy();
    expect(screen.getByText(text.revoked.nothingWaiting)).toBeTruthy();
    expect(screen.queryByRole("region", { name: text.sale.menuLabel })).toBeNull();

    tap(text.revoked.pair);
    expect(await screen.findByLabelText(text.pairing.codeLabel)).toBeTruthy();
    expect(screen.getByText(text.pairing.revokedNotice)).toBeTruthy();
    expect(credentials.saved()).toBeNull();
    expect(await store.cursor()).toBe("0");
  });

  it("lists what is unsent and clears nothing until a second, separate press", async () => {
    const { server, credentials, deps } = revokedTill();
    await signedInTill(server, { deps });
    const store = await deps.store;
    server.state.deviceRevoked = true;
    await store.enqueue(draftCommand());
    await store.enqueue(draftCommand());

    await screen.findByRole("heading", { name: text.revoked.title });
    expect(await screen.findByText(text.revoked.waiting(2))).toBeTruthy();
    expect(screen.getByRole("region", { name: text.revoked.waitingList }).textContent).toContain(
      "2",
    );
    tap(text.revoked.pair);
    expect(credentials.saved()).not.toBeNull();
    expect(await store.pendingCount()).toBe(2);
    expect(screen.getByText(text.revoked.warning)).toBeTruthy();

    tap(text.revoked.back);
    expect(await store.pendingCount()).toBe(2);
    tap(text.revoked.pair);
    tap(text.revoked.confirmDelete(2));
    expect(await screen.findByLabelText(text.pairing.codeLabel)).toBeTruthy();
    expect(await store.pendingCount()).toBe(0);
    expect(credentials.saved()).toBeNull();
  });

  it("is told apart from the staff session's own 401, which only asks for the PIN again", async () => {
    const { server, deps } = revokedTill();
    await signedInTill(server, { deps });
    server.state.expiredTokens.add("staff-0199f000-0000-7000-8000-0000000051a1");
    tap(/^Cà phê sữa/);
    tap(/^Thêm vào đơn/);
    expect(
      await screen.findByRole("heading", { name: text.staff.title }, { timeout: 3_000 }),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: text.revoked.title })).toBeNull();
  });

  it("is also heard on the very first load of the shop's data", async () => {
    const server = cafeServer();
    server.state.bootstrapFailure = refusal(401, "API_DEVICE_UNAUTHENTICATED");
    const credentials = memoryCredentials(CREDENTIAL);
    render(<PosApp deps={fakeDependencies(server, { credentials: credentials.store })} />);
    expect(await screen.findByRole("heading", { name: text.revoked.title })).toBeTruthy();
    tap(text.revoked.pair);
    await waitFor(() => expect(credentials.saved()).toBeNull());
    cleanup();
  });
});
