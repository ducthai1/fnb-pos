import { act, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ClientErrorReporter } from "../features/client-errors/client-error-reporter";
import type { UpdateSource } from "../features/updates/release-watch";
import { vi as text } from "../messages/vi";
import { CREDENTIAL, fakeDependencies, memoryCredentials } from "../test-support/fake-pos-server";
import { cafeServer, signedInTill } from "../test-support/signed-in-till";

function wiredDependencies() {
  const server = cafeServer();
  let serve: (available: string | null) => void = () => {};
  const updates: UpdateSource = {
    subscribe(onChange) {
      serve = onChange;
      return () => {};
    },
  };
  const clientErrors: ClientErrorReporter = {
    capture: vi.fn(),
    authenticate: vi.fn(),
    flush: vi.fn(async () => {}),
  };
  const reload = vi.fn();
  const deps = {
    ...fakeDependencies(server, { credentials: memoryCredentials(CREDENTIAL).store }),
    clientErrors,
    updates,
    reload,
  };
  return { server, deps, clientErrors, reload, serve: (id: string | null) => act(() => serve(id)) };
}

describe("a paired till and new releases", () => {
  it("offers an update during a shift and reloads only when the cashier asks", async () => {
    const { server, deps, serve, reload } = wiredDependencies();
    await signedInTill(server, { deps });
    expect(screen.queryByText(text.update.banner)).toBeNull();
    serve("9.9.9+newer");
    expect(await screen.findByText(text.update.banner)).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();
    const button = await screen.findByRole("button", { name: text.update.now });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    act(() => button.click());
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it("takes the banner away when the served release is the running one again", async () => {
    const { server, deps, serve } = wiredDependencies();
    await signedInTill(server, { deps });
    serve("9.9.9+newer");
    await screen.findByText(text.update.banner);
    serve(null);
    await waitFor(() => expect(screen.queryByText(text.update.banner)).toBeNull());
  });
});
