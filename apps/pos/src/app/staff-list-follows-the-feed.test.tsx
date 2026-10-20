import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CREDENTIAL, fakeDependencies, memoryCredentials } from "../test-support/fake-pos-server";
import { LAN, cafeServer } from "../test-support/signed-in-till";
import { tid } from "../test-support/till-fixtures";
import { PosApp } from "./pos-app";

const MAI = { id: tid(0x5a2), displayName: "Mai", active: true };
const HOA = { id: tid(0x5a3), displayName: "Hoa", active: true };
const staffButton = (name: string) => screen.queryByRole("button", { name });

describe("who the PIN screen lists", () => {
  it("drops someone locked in the backoffice and lists someone new, as the feed says", async () => {
    const server = cafeServer([LAN, MAI]);
    const credentials = memoryCredentials(CREDENTIAL).store;
    render(<PosApp deps={fakeDependencies(server, { credentials })} />);
    await screen.findByRole("button", { name: MAI.displayName });

    server.state.feed.push(
      { entity: "staff_member", entityId: MAI.id, snapshot: null },
      { entity: "staff_member", entityId: HOA.id, snapshot: { ...HOA, version: 40 } },
    );
    await waitFor(() => expect(staffButton(MAI.displayName)).toBeNull());
    await screen.findByRole("button", { name: HOA.displayName });
    expect(staffButton(LAN.displayName)).not.toBeNull();
  });

  it("keeps listing someone whose copy the feed renames, under the new name", async () => {
    const server = cafeServer([LAN, MAI]);
    const credentials = memoryCredentials(CREDENTIAL).store;
    render(<PosApp deps={fakeDependencies(server, { credentials })} />);
    await screen.findByRole("button", { name: MAI.displayName });
    const renamed = { ...MAI, displayName: "Mai Anh", version: 41 };
    server.state.feed.push({ entity: "staff_member", entityId: MAI.id, snapshot: renamed });
    await screen.findByRole("button", { name: "Mai Anh" });
    expect(staffButton(MAI.displayName)).toBeNull();
  });
});
