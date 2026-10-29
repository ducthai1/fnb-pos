import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ClientErrorReporter } from "../features/client-errors/client-error-reporter";
import { CREDENTIAL, fakeDependencies, memoryCredentials } from "../test-support/fake-pos-server";
import { cafeServer, signedInTill } from "../test-support/signed-in-till";

describe("a paired till and its fault reports", () => {
  it("hands its credential to the fault reporter and flushes after a sync that got through", async () => {
    const server = cafeServer();
    const clientErrors: ClientErrorReporter = {
      capture: vi.fn(),
      authenticate: vi.fn(),
      flush: vi.fn(async () => {}),
    };
    const deps = {
      ...fakeDependencies(server, { credentials: memoryCredentials(CREDENTIAL).store }),
      clientErrors,
    };
    await signedInTill(server, { deps });
    expect(clientErrors.authenticate).toHaveBeenCalledWith(CREDENTIAL.deviceToken);
    await waitFor(() => expect(clientErrors.flush).toHaveBeenCalled());
  });
});
