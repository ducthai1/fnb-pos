import { type Grant, type PermissionAction, basisPoints } from "@fnb/domain";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ApiResult } from "../../features/api/api-result";
import type { ApprovalRequest } from "../../features/api/pos-api";
import { tillAuthority } from "../../features/permissions/till-authority";
import { TillPermissionsProvider } from "../../features/permissions/till-permissions-context";
import {
  type ApprovalOutcome,
  useApprovalGate,
} from "../../features/permissions/use-approval-gate";
import { vi as text } from "../../messages/vi";
import { CREDENTIAL } from "../../test-support/credential";
import { fakeApiState, fakePosApi, refusal } from "../../test-support/fake-pos-api";

const LAN = { id: "0199f000-0000-7000-8000-0000000051a1", displayName: "Lan", active: true };
const MINH = { id: "0199f000-0000-7000-8000-0000000051a2", displayName: "Minh", active: true };
const THU = { id: "0199f000-0000-7000-8000-0000000051a3", displayName: "Thu", active: true };
const CASHIER: Grant[] = [{ key: "line_discount", threshold: { maxRate: basisPoints(1000) } }];
const TWENTY: PermissionAction = { key: "line_discount", discountRate: basisPoints(2000) };
const ASKED = "Giảm 20% món Bạc xỉu L";

function Harness(props: { action: PermissionAction; onOutcome(outcome: ApprovalOutcome): void }) {
  const gate = useApprovalGate();
  if (gate.sheet !== null) return <>{gate.sheet}</>;
  return (
    <button
      type="button"
      onClick={() => void gate.require(props.action, ASKED).then(props.onOutcome)}
    >
      Làm
    </button>
  );
}

function gateFor(
  action: PermissionAction,
  requestApproval?: (request: ApprovalRequest) => Promise<ApiResult<string>>,
) {
  const state = fakeApiState();
  state.pins.set(MINH.id, "2468");
  state.pins.set(THU.id, "1357");
  const api = fakePosApi(state);
  const outcomes: ApprovalOutcome[] = [];
  const expired: number[] = [];
  const authority = tillAuthority({
    staffId: LAN.id,
    grants: CASHIER,
    staff: [LAN, MINH, THU],
    requestApproval:
      requestApproval ?? ((request) => api.requestApproval(CREDENTIAL, `staff-${LAN.id}`, request)),
  });
  render(
    <TillPermissionsProvider value={{ authority, onSessionExpired: () => void expired.push(1) }}>
      <Harness action={action} onOutcome={(outcome) => void outcomes.push(outcome)} />
    </TillPermissionsProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Làm" }));
  return { state, outcomes, expired };
}

const tap = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const typePin = (pin: string) => {
  for (const digit of pin) tap(digit);
  tap(text.approval.approve);
};

describe("asking a manager on the spot", () => {
  it("goes ahead without asking anyone when the cashier's grants cover the action", async () => {
    const { state, outcomes } = gateFor({ ...TWENTY, discountRate: basisPoints(1000) });
    await screen.findByRole("button", { name: "Làm" });
    await Promise.resolve();
    expect(outcomes).toEqual([{ kind: "allowed" }]);
    expect(screen.queryByText(text.approval.title)).toBeNull();
    expect(state.calls.approvals).toEqual([]);
  });

  it("says what is asked, offers everyone but the cashier, and approves exactly that action", async () => {
    const { state, outcomes } = gateFor(TWENTY);
    expect(await screen.findByRole("heading", { name: text.approval.title })).toBeTruthy();
    expect(screen.getByText(ASKED)).toBeTruthy();
    expect(screen.queryByRole("button", { name: LAN.displayName })).toBeNull();
    tap(MINH.displayName);
    typePin("1111");
    expect(await screen.findByText(text.errors.API_STAFF_PIN_INVALID)).toBeTruthy();
    expect((screen.getByLabelText(text.staff.pinLabel) as HTMLInputElement).value).toBe("");
    typePin("2468");
    await screen.findByRole("button", { name: "Làm" });
    expect(outcomes).toEqual([
      { kind: "approved", approvalId: state.approvals[0]?.approvalId, approverStaffId: MINH.id },
    ]);
    expect(state.calls.approvals.at(-1)).toEqual({
      action: { key: "line_discount", discountRate: 2000 },
      approverStaffId: MINH.id,
      approverPin: "2468",
      staffToken: `staff-${LAN.id}`,
    });
  });

  it("sends nothing and records nothing when nobody approves", async () => {
    const { state, outcomes } = gateFor(TWENTY);
    tap(THU.displayName);
    tap(text.approval.cancel);
    await screen.findByRole("button", { name: "Làm" });
    expect(outcomes).toEqual([{ kind: "cancelled" }]);
    expect(state.calls.approvals).toEqual([]);
  });

  it("says approving needs the network when the server cannot be reached", async () => {
    const { state, outcomes } = gateFor(TWENTY);
    state.online = false;
    tap(MINH.displayName);
    typePin("2468");
    expect(await screen.findByText(text.approval.offline)).toBeTruthy();
    expect(outcomes).toEqual([]);
  });

  it("says the person chosen may not approve it, and lets the cashier pick someone else", async () => {
    const { state, outcomes } = gateFor(TWENTY);
    state.notPermittedApprovers.add(THU.id);
    tap(THU.displayName);
    typePin("1357");
    expect(await screen.findByText(text.errors.API_APPROVAL_APPROVER_NOT_PERMITTED)).toBeTruthy();
    tap(text.approval.otherApprover);
    tap(MINH.displayName);
    typePin("2468");
    await screen.findByRole("button", { name: "Làm" });
    expect(outcomes.map((outcome) => outcome.kind)).toEqual(["approved"]);
  });

  it("says until when a manager locked out by wrong PINs can try again", async () => {
    const lockedUntil = "2026-10-20T05:30:00.000Z";
    gateFor(TWENTY, async () =>
      refusal(429, "API_STAFF_PIN_LOCKED", { code: "API_STAFF_PIN_LOCKED", lockedUntil }),
    );
    tap(MINH.displayName);
    typePin("2468");
    const time = new Date(lockedUntil).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
    expect(await screen.findByText(text.errors.pinLockedUntil(time))).toBeTruthy();
  });

  it("goes back to the PIN screen when the cashier's own session has run out", async () => {
    const { state, outcomes, expired } = gateFor(TWENTY);
    state.expiredTokens.add(`staff-${LAN.id}`);
    tap(MINH.displayName);
    typePin("2468");
    await screen.findByRole("button", { name: "Làm" });
    expect(expired).toEqual([1]);
    expect(outcomes).toEqual([{ kind: "cancelled" }]);
  });
});
