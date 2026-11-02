import { formatVnd, vnd } from "@fnb/domain";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import { commandNameOf } from "../messages/vi-sync-errors";
import { counterWithManager, managerApproves, pushedOf, tap } from "../test-support/approval-cafe";
import {
  CREDENTIAL,
  fakeDependencies,
  memoryCredentials,
  memoryStore,
} from "../test-support/fake-pos-server";
import { signedInTill } from "../test-support/signed-in-till";

const C = text.cash;
const D = text.needsAttention.dismissal;
const money = (amount: number) => formatVnd(vnd(amount));
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const entryWith = (code: string) => document.querySelector(`[data-rejected-code="${code}"]`);
const REFUSED = "SYNC_SHIFT_VERSION_STALE";
const LONG_WORDS =
  "Đã chi 200.000 ₫ tiền đá cho anh giao hàng\nPhiếu chi kẹp trong két, quản lý Minh đã ký xác nhận cuối ca";

/** A cashier whose cash move out of the drawer the server refused, at the needs-attention list. */
async function refusedCashMove(server = counterWithManager()) {
  const store = await tillOf(server);
  server.state.refuseTypes.set("shift.cash_move", REFUSED);
  tap(C.open);
  await screen.findByLabelText(C.amount);
  fireEvent.change(field(C.amount), { target: { value: "200000" } });
  fireEvent.change(field(C.reason), { target: { value: "Trả tiền đá" } });
  tap(C.confirm("out", money(200_000)));
  await waitFor(() => expect(pushedOf(server, "shift.cash_move")).toHaveLength(1));
  fireEvent.click(await screen.findByRole("link", { name: text.sync.needsAttention(1) }));
  await screen.findByRole("heading", { name: text.needsAttention.title });
  return { server, store };
}

/** The till signed in, with its store at hand to read what it holds. */
async function tillOf(server: ReturnType<typeof counterWithManager>) {
  const store = memoryStore();
  const credentials = memoryCredentials(CREDENTIAL).store;
  await signedInTill(server, {
    deps: fakeDependencies(server, { store: Promise.resolve(store), credentials }),
  });
  return store;
}

async function fillDismissal() {
  const dismiss = entryWith(REFUSED)?.querySelector("button:last-of-type");
  if (dismiss === null || dismiss === undefined) throw new Error("no dismiss button");
  fireEvent.click(dismiss);
  await screen.findByRole("heading", { name: D.title });
  tap(text.reasons.handled_by_hand);
  fireEvent.change(screen.getByLabelText(text.adjust.reasonNote), { target: { value: LONG_WORDS } });
  tap(D.confirm);
}

describe("setting aside a refused cash move or shift close, as a cashier", () => {
  it("asks a manager to approve for that shift, and sends the shift and approval with the trace", async () => {
    const { server, store } = await refusedCashMove();
    const refused = (await store.rejectedCommands())[0];
    expect(refused?.entity).toBe("shift");
    await fillDismissal();
    await screen.findByRole("heading", { name: text.approval.title });
    expect(document.querySelector("[data-approval-for]")?.textContent).toContain(
      text.approval.actions.dismissRefusedShift(commandNameOf("shift.cash_move")),
    );
    await managerApproves();
    await waitFor(() => expect(pushedOf(server, "sync.rejection_dismissed")).toHaveLength(1));
    expect(server.state.calls.approvals[0]?.action).toEqual({
      key: "open_drawer",
      subject: { shiftId: refused?.entityId },
    });
    expect(pushedOf(server, "sync.rejection_dismissed")[0]?.payload).toMatchObject({
      rejectedType: "shift.cash_move",
      shiftId: refused?.entityId,
      approvalId: server.state.approvals[0]?.approvalId,
      reasonNote: LONG_WORDS,
    });
    await waitFor(() => expect(entryWith(REFUSED)).toBeNull());
  });

  it("records nothing when nobody approves, and keeps the refusal on the list", async () => {
    const { server } = await refusedCashMove();
    await fillDismissal();
    await screen.findByRole("heading", { name: text.approval.title });
    tap(text.approval.cancel);
    await screen.findByRole("heading", { name: D.title });
    expect(pushedOf(server, "sync.rejection_dismissed")).toEqual([]);
    expect(server.state.calls.approvals).toEqual([]);
  });

  it("leaves the till's shift as the server holds it once a refused close is set aside", async () => {
    const server = counterWithManager();
    const store = await tillOf(server);
    server.state.refuseTypes.set("shift.close", REFUSED);
    tap(text.closeShift.open);
    await screen.findByRole("heading", { name: text.closeShift.title });
    tap(text.closeShift.confirm);
    await waitFor(() => expect(pushedOf(server, "shift.close")).toHaveLength(1));
    const refused = await waitFor(async () => {
      const [entry] = await store.rejectedCommands();
      if (entry === undefined) throw new Error("not refused yet");
      return entry;
    });
    const shiftId = refused.entityId;
    // Refused: the till's copy is the server's again, an open shift.
    expect((await store.snapshot("shift", shiftId))?.snapshot.status).toBe("open");
    fireEvent.click(await screen.findByRole("link", { name: text.sync.needsAttention(1) }));
    await screen.findByRole("heading", { name: text.needsAttention.title });
    await fillDismissal();
    await managerApproves();
    await waitFor(() => expect(pushedOf(server, "sync.rejection_dismissed")).toHaveLength(1));
    expect(pushedOf(server, "sync.rejection_dismissed")[0]?.payload).toMatchObject({ shiftId });
    expect((await store.snapshot("shift", shiftId))?.snapshot.status).toBe("open");
    expect(server.rows.get(shiftId)?.status).toBe("open");
  });
});
