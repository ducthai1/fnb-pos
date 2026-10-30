import type { RejectedCommand } from "@fnb/sync-client";
import type { ReactElement } from "react";
import { vi } from "../../src/messages/vi";
import { BlockedScreen } from "../../src/screens/blocked/blocked-screen";
import { CrashScreen } from "../../src/screens/crash/crash-screen";
import { BootstrapScreen } from "../../src/screens/bootstrap/bootstrap-screen";
import { NeedsAttentionScreen } from "../../src/screens/needs-attention/needs-attention-screen";
import { PairDeviceScreen } from "../../src/screens/pair-device/pair-device-screen";
import { UpdateRequiredScreen } from "../../src/screens/update/update-required-screen";
import { PinEntry } from "../../src/screens/staff-login/pin-entry";
import { StaffPicker } from "../../src/screens/staff-login/staff-picker";
import { SHOP } from "./pretty-menu";
import { STAFF } from "./pretty-order";

// Pairing, signing in and the refused commands of the sample café's till.

const never = () => new Promise<never>(() => {});
const nothing = () => {};
const staff = [STAFF.cashier, STAFF.barista, STAFF.manager, "Thảo", "Vy"].map((displayName, i) => ({
  id: `s${i}`,
  displayName,
  active: true,
}));
const refused = (index: number, type: string, code: string): RejectedCommand => ({
  entity: "order",
  entityId: `order-${index}`,
  code,
  serverSnapshot: null,
  command: {
    commandId: `0199f000-0000-7000-8000-00000000000${index}`,
    deviceSeq: index,
    type,
    payload: {},
    businessDate: "2026-10-21",
    domainVersion: "0.1.0",
    createdAt: "2026-10-21T03:00:00.000Z",
  },
});
const settledQr = refused(2, "order.pay", "SYNC_ORDER_HAS_SETTLED_QR");
const stale = refused(1, "order.save_draft", "SYNC_ORDER_VERSION_STALE");
const wantsApproval = refused(3, "order.cancel", "SYNC_APPROVAL_REQUIRED");

export const ENTRY_SCREENS = {
  blocked: () => <BlockedScreen reason="another_tab" onReload={nothing} />,
  crash: () => <CrashScreen onReload={nothing} />,
  pairing: () => <PairDeviceScreen pair={never} onPaired={never} />,
  // A till that sold through a long outage before it learned the server moved on.
  "update-required": () => (
    <UpdateRequiredScreen pendingCommands={128} updating={false} onUpdate={nothing} />
  ),
  "bootstrap-failed": () => <BootstrapScreen error={vi.errors.network} onRetry={nothing} />,
  "staff-picker": () => <StaffPicker branchName={SHOP.branch} staff={staff} onChoose={nothing} />,
  "pin-entry": () => (
    <PinEntry staff={staff[0]!} signIn={never} onSignedIn={nothing} onBack={nothing} />
  ),
  "needs-attention": () => (
    <NeedsAttentionScreen
      rejected={[stale, wantsApproval, settledQr]}
      closable={new Set([settledQr.entityId])}
      onCloseWithSettledQr={nothing}
      redoable={new Set([stale.command.commandId])}
      openable={new Set([stale.entityId, wantsApproval.entityId])}
      notes={new Map([[stale.command.commandId, vi.needsAttention.notes.notDraft]])}
      onRedo={nothing}
      onOpenOrder={nothing}
      onDismiss={nothing}
      onBack={nothing}
    />
  ),
} satisfies Record<string, () => ReactElement>;
