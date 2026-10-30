import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { vi as text } from "../messages/vi";
import {
  CREDENTIAL,
  draftCommand,
  fakeDependencies,
  memoryCredentials,
} from "../test-support/fake-pos-server";
import { cafeServer, signedInTill } from "../test-support/signed-in-till";

describe("a till below the server's minimum build", () => {
  it("shows only the update screen, keeps its commands and reloads on the button", async () => {
    const server = cafeServer();
    const reload = vi.fn();
    const deps = {
      ...fakeDependencies(server, { credentials: memoryCredentials(CREDENTIAL).store }),
      reload,
    };
    await signedInTill(server, { deps });
    const store = await deps.store;
    server.state.buildRefused = true;
    await store.enqueue(draftCommand());

    const screenTitle = await screen.findByRole("heading", { name: text.update.required.title });
    expect(screenTitle).toBeTruthy();
    expect(await screen.findByText(text.update.required.pending(1))).toBeTruthy();
    // Nothing of the till is left to touch, and nothing went to "needs attention".
    expect(screen.queryByRole("region", { name: text.sale.menuLabel })).toBeNull();
    expect(await store.rejectedCommands()).toEqual([]);
    expect(await store.pendingCount()).toBe(1);

    expect(reload).not.toHaveBeenCalled();
    act(() => fireEvent.click(screen.getByRole("button", { name: text.update.now })));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: text.update.updating })).toBeTruthy();
  });

  it("says nothing is lost when nothing is waiting", async () => {
    const server = cafeServer();
    await signedInTill(server);
    server.state.buildRefused = true;
    expect(await screen.findByText(text.update.required.nothingPending)).toBeTruthy();
  });
});
