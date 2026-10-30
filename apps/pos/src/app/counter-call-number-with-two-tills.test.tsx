import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import { fakeServer } from "../test-support/fake-pos-server";
import { LAN, signedInTill } from "../test-support/signed-in-till";
import { tillBootstrap } from "../test-support/till-fixtures";

function serverWith(callNumbering?: { deviceIndex: number | null; tillsInBranch: number }) {
  const server = fakeServer(
    tillBootstrap({ staff: [LAN], ...(callNumbering === undefined ? {} : { callNumbering }) }),
  );
  server.state.pins.set(LAN.id, "4826");
  return server;
}

describe("the call number on the counter's order", () => {
  it("carries the till's index when the branch has two tills", async () => {
    await signedInTill(serverWith({ deviceIndex: 2, tillsInBranch: 2 }));
    expect(screen.getByText(text.sale.callNumber("201"))).toBeTruthy();
  });

  it("stays plain on a branch with one till", async () => {
    await signedInTill(serverWith({ deviceIndex: 1, tillsInBranch: 1 }));
    expect(screen.getByText(text.sale.callNumber("1"))).toBeTruthy();
  });

  it("stays plain when the server says nothing of numbering (an older server)", async () => {
    await signedInTill(serverWith());
    expect(screen.getByText(text.sale.callNumber("1"))).toBeTruthy();
  });
});
