import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import { draftCommand } from "../test-support/fake-pos-server";
import { LAN, cafeServer, signedInTill } from "../test-support/signed-in-till";

const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const LAN_TOKEN = `staff-${LAN.id}`;

describe("signing out at the till", () => {
  it("ends the session at the server and goes back to the PIN screen", async () => {
    const server = cafeServer();
    await signedInTill(server);
    tap(text.session.signOut);
    expect(await screen.findByRole("heading", { name: text.staff.title })).toBeTruthy();
    await waitFor(() => expect(server.state.calls.signOut).toEqual([LAN_TOKEN]));
    expect(screen.getByRole("alert").textContent).toBe(text.session.signedOut(LAN.displayName));
  });

  it("signs out on the till all the same when the network is down", async () => {
    const server = cafeServer();
    await signedInTill(server);
    server.state.online = false;
    tap(text.session.signOut);
    expect(await screen.findByRole("heading", { name: text.staff.title })).toBeTruthy();
    await waitFor(() => expect(server.state.calls.signOut).toEqual([LAN_TOKEN]));
  });

  it("keeps the session alive while commands recorded under it still wait to be sent", async () => {
    const server = cafeServer();
    const deps = await signedInTill(server);
    server.state.pushesHeld = true;
    const store = await deps.store;
    await store.enqueue({ ...draftCommand(), staffSessionId: `${LAN.id.slice(0, 24)}5e55${LAN.id.slice(28)}` });
    tap(text.session.signOut);
    expect(await screen.findByRole("heading", { name: text.staff.title })).toBeTruthy();
    // Give the call the time it would have taken, then check it was never made.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(server.state.calls.signOut).toEqual([]);
  });

  it("does not end the session by switching to another cashier", async () => {
    const server = cafeServer();
    await signedInTill(server);
    tap(text.sales.switchStaff);
    expect(await screen.findByRole("heading", { name: text.staff.title })).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(server.state.calls.signOut).toEqual([]);
  });
});
