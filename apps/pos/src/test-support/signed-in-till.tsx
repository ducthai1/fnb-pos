import { fireEvent, render, screen } from "@testing-library/react";
import { PosApp } from "../app/pos-app";
import { vi as text } from "../messages/vi";
import { CREDENTIAL, fakeDependencies, fakeServer, memoryCredentials } from "./fake-pos-server";
import { tillBootstrap } from "./till-fixtures";

export const LAN = { id: "0199f000-0000-7000-8000-0000000051a1", displayName: "Lan", active: true };

/** The fake server with the pilot café's menu and Lan, whose PIN is 4826. */
export function cafeServer(staff: { id: string; displayName: string; active: boolean }[] = [LAN]) {
  const server = fakeServer(tillBootstrap({ staff }));
  server.state.pins.set(LAN.id, "4826");
  return server;
}

export async function typePin(pin: string) {
  for (const digit of pin) fireEvent.click(screen.getByRole("button", { name: digit }));
  fireEvent.click(screen.getByRole("button", { name: text.staff.submit }));
}

/** A paired till with Lan signed in, past a first sync pass that got through. */
export async function signedInTill(server: ReturnType<typeof fakeServer>) {
  const deps = fakeDependencies(server, { credentials: memoryCredentials(CREDENTIAL).store });
  render(<PosApp deps={deps} />);
  fireEvent.click(await screen.findByRole("button", { name: LAN.displayName }));
  await typePin("4826");
  await screen.findByText(text.sync.online);
  return deps;
}
