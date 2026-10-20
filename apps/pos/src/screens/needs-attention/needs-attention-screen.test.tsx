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
