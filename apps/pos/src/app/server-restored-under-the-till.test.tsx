import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VI_SERVER_RESTORE } from "../messages/vi-server-restore";
import { CREDENTIAL, fakeDependencies, memoryCredentials } from "../test-support/fake-pos-server";
import { cafeServer, signedInTill } from "../test-support/signed-in-till";
import type { PosDependencies } from "./pos-dependencies";

const OLD = "0192f5a4-0000-7000-8000-0000000000d1";
const NEW = "0192f5a4-0000-7000-8000-0000000000d2";

/** The fake server, naming a generation that the test can change as a restore would. */
function serverWithGenerations() {
  const server = cafeServer();
  const base = fakeDependencies(server, { credentials: memoryCredentials(CREDENTIAL).store });
  const generation = { current: OLD };
  const deps: PosDependencies = {
    ...base,
    transportFor: (credential, staffToken) => {
      const inner = base.transportFor(credential, staffToken);
      return {
        ...inner,
        pullChanges: async (cursor, limit) => ({
          ...(await inner.pullChanges(cursor, limit)),
          serverGeneration: generation.current,
        }),
        deviceState: async () => ({ serverGeneration: generation.current, lastDeviceSeq: 0 }),
      };
    },
  };
  return { server, deps, generation };
}

describe("a server restored from a backup under a running till", () => {
  it("says the till is sending its commands again, and stops saying so once they are in", async () => {
    const { server, deps, generation } = serverWithGenerations();
    await signedInTill(server, { deps });
    const shiftOpens = () => server.state.pushed.filter((c) => c.type === "shift.open");
    await waitFor(() => expect(shiftOpens()).toHaveLength(1));
    expect(screen.queryByText(VI_SERVER_RESTORE.resending(1))).toBeNull();

    server.state.pushesHeld = true;
    generation.current = NEW;
    expect(await screen.findByText(VI_SERVER_RESTORE.resending(1))).toBeTruthy();

    server.state.pushesHeld = false;
    await waitFor(() => expect(screen.queryByText(VI_SERVER_RESTORE.resending(1))).toBeNull());
    expect(shiftOpens().map((c) => c.commandId)).toEqual([
      shiftOpens()[0]?.commandId,
      shiftOpens()[0]?.commandId,
    ]);
    expect(shiftOpens()[1]?.resentFromGeneration).toBe(OLD);
  });
});
