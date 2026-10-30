import type { RejectedCommand } from "@fnb/sync-client";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../../messages/vi";
import { NeedsAttentionScreen } from "./needs-attention-screen";

const refusal = (type: string, code: string, orderId: string): RejectedCommand => ({
  entity: "order",
  entityId: orderId,
  code,
  serverSnapshot: null,
  command: {
    commandId: `0199f000-0000-7000-8000-${orderId.padStart(12, "0")}`,
    deviceSeq: 1,
    type,
    payload: { orderId },
    businessDate: "2026-10-20",
    domainVersion: "0.1.0",
    createdAt: "2026-10-20T03:00:00.000Z",
  },
});

describe("the commands the server refused for good", () => {
  it("names each command and says what its refusal means", () => {
    render(
      <NeedsAttentionScreen
        rejected={[refusal("payment.create_intent", "SYNC_PAYMENT_CONTENT_CODE_TAKEN", "1")]}
        onBack={() => {}}
      />,
    );
    expect(screen.getByText(text.errors.SYNC_PAYMENT_CONTENT_CODE_TAKEN)).toBeTruthy();
    expect(
      screen.getByText(
        text.needsAttention.commandLine(
          "Tạo mã QR chuyển khoản",
          "SYNC_PAYMENT_CONTENT_CODE_TAKEN",
        ),
      ),
    ).toBeTruthy();
  });

  it("says a refund refused for want of a shift is done again from the history once one is open", () => {
    render(
      <NeedsAttentionScreen
        rejected={[refusal("order.refund", "SYNC_REFUND_NEEDS_SHIFT", "5")]}
        onBack={() => {}}
      />,
    );
    expect(screen.getByText(text.errors.SYNC_REFUND_NEEDS_SHIFT)).toBeTruthy();
    expect(text.errors.SYNC_REFUND_NEEDS_SHIFT).toContain("Mở ca");
    expect(
      screen.getByText(text.needsAttention.commandLine("Hoàn đơn", "SYNC_REFUND_NEEDS_SHIFT")),
    ).toBeTruthy();
  });

  it("shows a command it has no name for as it came, with the general sentence", () => {
    render(
      <NeedsAttentionScreen
        rejected={[refusal("table.merge", "SYNC_NEW", "2")]}
        onBack={() => {}}
      />,
    );
    expect(
      screen.getByText(text.needsAttention.commandLine("table.merge", "SYNC_NEW")),
    ).toBeTruthy();
    expect(screen.getByText(text.errors.unknown)).toBeTruthy();
  });

  it("offers to close with the paid QR only an order the till can close that way", () => {
    const closed: string[] = [];
    render(
      <NeedsAttentionScreen
        rejected={[
          refusal("order.pay", "SYNC_ORDER_HAS_SETTLED_QR", "3"),
          refusal("order.pay", "SYNC_ORDER_HAS_SETTLED_QR", "4"),
        ]}
        closable={new Set(["4"])}
        onCloseWithSettledQr={(orderId) => closed.push(orderId)}
        onBack={() => {}}
      />,
    );
    const buttons = screen.getAllByRole("button", { name: text.qr.closeWithSettledQr });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]!);
    expect(closed).toEqual(["4"]);
  });
});

describe("what can be done about each refusal", () => {
  const stale = refusal("order.save_draft", "SYNC_ORDER_VERSION_STALE", "7");
  const needsApproval = refusal("order.cancel", "SYNC_APPROVAL_REQUIRED", "8");
  const id = (entry: RejectedCommand) => entry.command.commandId;

  it("offers saving a stale draft again, and sends the refusal it was tapped on", () => {
    const redone: RejectedCommand[] = [];
    render(
      <NeedsAttentionScreen
        rejected={[stale]}
        redoable={new Set([id(stale)])}
        onRedo={(entry) => redone.push(entry)}
        onBack={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: text.needsAttention.redo }));
    expect(redone).toEqual([stale]);
  });

  it("leads a cancel the server wanted approved to the order, to ask and send again", () => {
    const opened: string[] = [];
    render(
      <NeedsAttentionScreen
        rejected={[needsApproval]}
        openable={new Set(["8"])}
        onOpenOrder={(orderId) => opened.push(orderId)}
        onBack={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: text.needsAttention.openForApproval }));
    expect(opened).toEqual(["8"]);
  });

  it("opens an order refused for another reason without promising an approval", () => {
    render(
      <NeedsAttentionScreen
        rejected={[stale]}
        openable={new Set(["7"])}
        onOpenOrder={() => {}}
        onBack={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: text.needsAttention.open })).toBeTruthy();
    expect(screen.queryByRole("button", { name: text.needsAttention.openForApproval })).toBeNull();
  });

  it("offers no open for an order that is no longer a draft on the till", () => {
    render(
      <NeedsAttentionScreen
        rejected={[needsApproval]}
        openable={new Set()}
        onOpenOrder={() => {}}
        onBack={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: text.needsAttention.open })).toBeNull();
    expect(screen.queryByRole("button", { name: text.needsAttention.openForApproval })).toBeNull();
  });

  it("says what an action found, and disables a redo that is working", () => {
    render(
      <NeedsAttentionScreen
        rejected={[stale]}
        redoable={new Set([id(stale)])}
        busy={new Set([id(stale)])}
        notes={new Map([[id(stale), text.needsAttention.notes.notDraft]])}
        onRedo={() => {}}
        onBack={() => {}}
      />,
    );
    expect(screen.getByText(text.needsAttention.notes.notDraft)).toBeTruthy();
    const working = screen.getByRole("button", { name: text.needsAttention.working });
    expect((working as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers to set any refusal aside", () => {
    const aside: RejectedCommand[] = [];
    render(
      <NeedsAttentionScreen
        rejected={[stale]}
        onDismiss={(entry) => aside.push(entry)}
        onBack={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: text.needsAttention.dismiss }));
    expect(aside).toEqual([stale]);
  });
});
