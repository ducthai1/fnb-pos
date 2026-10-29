import type { RejectedCommand } from "@fnb/sync-client";
import { type ReactElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { vi } from "../../../src/messages/vi";
import { BlockedScreen } from "../../../src/screens/blocked/blocked-screen";
import { CrashScreen } from "../../../src/screens/crash/crash-screen";
import { BootstrapScreen } from "../../../src/screens/bootstrap/bootstrap-screen";
import { NeedsAttentionScreen } from "../../../src/screens/needs-attention/needs-attention-screen";
import { PairDeviceScreen } from "../../../src/screens/pair-device/pair-device-screen";
import { PinEntry } from "../../../src/screens/staff-login/pin-entry";
import { StaffPicker } from "../../../src/screens/staff-login/staff-picker";
import { HOSTILE_NAMES } from "../../../src/test-support/hostile-names";
import "../../../src/styles/pos-styles";
import { CHECKOUT_SCREENS } from "./checkout-screens";
import { HISTORY_REFUND_SCREENS } from "./history-refund-screens";
import { LINE_ENTRY_SCREENS } from "./line-entry-screens";
import { OPERATIONS_SCREENS } from "./operations-screens";
import { PHOTO_SALE_SCREENS } from "./photo-sale-screens";
import { QR_AND_INVOICE_SCREENS } from "./qr-and-invoice-screens";
import { SALE_SCREENS } from "./sale-screens";
import { TABLE_SCREENS } from "./table-screens";
import { TopBarSample } from "./topbar-sample";
import { SCREEN_NAMES, type ScreenName } from "./screen-names";

// Every movement lands at once: a measurement or a picture never catches one half done.
document.documentElement.dataset.motion = "off";

// Every screen of the POS, chosen by ?screen=, filled with the worst names a shop can type.

const staff = [
  { id: "s1", displayName: HOSTILE_NAMES.staff, active: true },
  { id: "s2", displayName: HOSTILE_NAMES.emoji, active: true },
  { id: "s3", displayName: HOSTILE_NAMES.decomposed, active: true },
  ...["Lan", "Minh", "Hùng", "Thu", "Vy"].map((name, i) => ({
    id: `n${i}`,
    displayName: name,
    active: true,
  })),
];
const never = () => new Promise<never>(() => {});
const rejected = (index: number): RejectedCommand => ({
  entity: "order",
  entityId: `order-${index}`,
  code: HOSTILE_NAMES.unknownCode,
  serverSnapshot: null,
  command: {
    commandId: `0199f000-0000-7000-8000-00000000000${index}`,
    deviceSeq: index,
    type: "order.save_draft",
    payload: {},
    businessDate: "2026-10-20",
    domainVersion: "0.1.0",
    createdAt: "2026-10-20T03:00:00.000Z",
  },
});

// Cash refused because the order's QR was paid: its sentence and the button closing it.
const settledQrRefusal: RejectedCommand = {
  ...rejected(4),
  code: "SYNC_ORDER_HAS_SETTLED_QR",
  command: { ...rejected(4).command, type: "order.pay" },
};

const SCREENS: Record<ScreenName, () => ReactElement> = {
  blocked: () => <BlockedScreen reason="another_tab" onReload={() => {}} />,
  crash: () => <CrashScreen onReload={() => {}} />,
  pairing: () => <PairDeviceScreen pair={never} onPaired={never} />,
  "bootstrap-failed": () => (
    <BootstrapScreen
      error={`${vi.errors.unknown} ${HOSTILE_NAMES.unknownCode}`}
      onRetry={() => {}}
    />
  ),
  "staff-picker": () => (
    <StaffPicker branchName={HOSTILE_NAMES.branch} staff={staff} onChoose={() => {}} />
  ),
  "pin-entry": () => (
    <PinEntry staff={staff[0]!} signIn={never} onSignedIn={() => {}} onBack={() => {}} />
  ),
  "needs-attention": () => (
    <NeedsAttentionScreen
      rejected={[...[1, 2, 3].map(rejected), settledQrRefusal]}
      closable={new Set([settledQrRefusal.entityId])}
      onCloseWithSettledQr={() => {}}
      onBack={() => {}}
    />
  ),
  ...SALE_SCREENS,
  ...PHOTO_SALE_SCREENS,
  ...CHECKOUT_SCREENS,
  ...LINE_ENTRY_SCREENS,
  ...QR_AND_INVOICE_SCREENS,
  ...TABLE_SCREENS,
  ...OPERATIONS_SCREENS,
  ...HISTORY_REFUND_SCREENS,
};

/** Marks the page once React has rendered the screen, so the test never measures early. */
function Ready({ name, children }: { name: string; children: ReactElement }) {
  useEffect(() => {
    document.body.dataset.screenReady = name;
  }, [name]);
  return children;
}

const params = new URLSearchParams(location.search);
const asked = params.get("screen");
const bar = params.get("bar");
const name = SCREEN_NAMES.find((known) => known === asked);
const root = document.getElementById("root");
if (root === null) throw new Error("no root");
if (bar !== null) {
  // Only the selling screen's bar, with the shop's name given (see topbar-sample.tsx).
  createRoot(root).render(
    <Ready name="bar">
      <TopBarSample brandName={bar} pending={Number(params.get("pending") ?? 0)} />
    </Ready>,
  );
} else {
  if (name === undefined) throw new Error(`no screen named "${asked}"`);
  createRoot(root).render(<Ready name={name}>{SCREENS[name]()}</Ready>);
}
