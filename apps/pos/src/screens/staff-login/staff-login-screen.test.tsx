import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ApiResult } from "../../features/api/api-result";
import type { StaffSession } from "../../features/api/pos-api";
import { vi as text } from "../../messages/vi";
import { refusal } from "../../test-support/fake-pos-server";
import { StaffLoginScreen } from "./staff-login-screen";

const LAN = { id: "0199f000-0000-7000-8000-0000000051a1", displayName: "Lan", active: true };
const MINH = { id: "0199f000-0000-7000-8000-0000000051a2", displayName: "Minh", active: true };
const SESSION: StaffSession = {
  staffId: LAN.id,
  token: "staff-token",
  expiresAt: "2026-10-20T15:00:00.000Z",
};

function loginScreen(answers: ApiResult<StaffSession>[]) {
  const sent: { staffId: string; pin: string }[] = [];
  const signedIn: string[] = [];
  render(
    <StaffLoginScreen
      branchName="Quận 1"
      staff={[LAN, MINH]}
      signIn={async (staffId, pin) => {
        sent.push({ staffId, pin });
        return answers.shift() ?? refusal(500, null);
      }}
      onSignedIn={(staff, session) => void signedIn.push(`${staff.displayName}:${session.token}`)}
    />,
  );
  return { sent, signedIn };
}

const tap = (label: string) => fireEvent.click(screen.getByRole("button", { name: label }));
const pinField = () => screen.getByLabelText(text.staff.pinLabel) as HTMLInputElement;
const tapPin = (pin: string) => {
  for (const digit of pin) tap(digit);
  tap(text.staff.submit);
};

describe("signing a staff member in at the till", () => {
  it("asks the chosen person's PIN and signs them in with what was tapped on the pad", async () => {
    const till = loginScreen([{ ok: true, value: SESSION }]);
    tap(LAN.displayName);
    expect(screen.getByText(text.staff.pinFor(LAN.displayName))).toBeTruthy();
    tapPin("4826");
    await waitFor(() => expect(till.signedIn).toEqual(["Lan:staff-token"]));
    expect(till.sent).toEqual([{ staffId: LAN.id, pin: "4826" }]);
  });

  it("refuses a PIN shorter than 4 digits without asking the server", async () => {
    const till = loginScreen([{ ok: true, value: SESSION }]);
    tap(LAN.displayName);
    tapPin("482");
    expect((await screen.findByRole("alert")).textContent).toBe(text.staff.pinIncomplete);
    expect(till.sent).toEqual([]);
  });

  it("keeps digits only, at most 6, whether typed or tapped", () => {
    loginScreen([]);
    tap(MINH.displayName);
    fireEvent.change(pinField(), { target: { value: "12a3 4" } });
    expect(pinField().value).toBe("1234");
    for (const digit of "5678") tap(digit);
    expect(pinField().value).toBe("123456");
    tap(text.staff.clear);
    expect(pinField().value).toBe("");
  });

  it("says a wrong PIN is wrong, clears it, and lets the next try through", async () => {
    const till = loginScreen([refusal(401, "API_STAFF_PIN_INVALID"), { ok: true, value: SESSION }]);
    tap(LAN.displayName);
    tapPin("1111");
    expect((await screen.findByRole("alert")).textContent).toBe(text.errors.API_STAFF_PIN_INVALID);
    expect(pinField().value).toBe("");
    expect(till.signedIn).toEqual([]);
    tapPin("4826");
    await waitFor(() => expect(till.signedIn).toEqual(["Lan:staff-token"]));
  });

  it("says until when a locked PIN stays locked", async () => {
    const lockedUntil = "2026-10-20T03:15:00.000Z";
    const locked = refusal(429, "API_STAFF_PIN_LOCKED", {
      code: "API_STAFF_PIN_LOCKED",
      lockedUntil,
    });
    loginScreen([locked]);
    tap(LAN.displayName);
    tapPin("4826");
    const time = new Date(lockedUntil).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
    expect((await screen.findByRole("alert")).textContent).toBe(text.errors.pinLockedUntil(time));
  });

  it("goes back to the list to pick someone else", () => {
    loginScreen([]);
    tap(LAN.displayName);
    tap(text.staff.back);
    expect(screen.getByRole("button", { name: MINH.displayName })).toBeTruthy();
    expect(screen.queryByLabelText(text.staff.pinLabel)).toBeNull();
  });
});
