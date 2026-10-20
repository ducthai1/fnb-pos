import type { RejectedCommand } from "@fnb/sync-client";
import { type ReactElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { vi } from "../../../src/messages/vi";
import { BlockedScreen } from "../../../src/screens/blocked/blocked-screen";
import { BootstrapScreen } from "../../../src/screens/bootstrap/bootstrap-screen";
import { NeedsAttentionScreen } from "../../../src/screens/needs-attention/needs-attention-screen";
import { PairDeviceScreen } from "../../../src/screens/pair-device/pair-device-screen";
import { SalesHomeScreen } from "../../../src/screens/sales-home/sales-home-screen";
import { PinEntry } from "../../../src/screens/staff-login/pin-entry";
import { StaffPicker } from "../../../src/screens/staff-login/staff-picker";
import { hostileTillMenu } from "../../../src/test-support/hostile-menu";
import { HOSTILE_NAMES } from "../../../src/test-support/hostile-names";
import "../../../src/styles/pos-base.css";
import "../../../src/styles/pos-screens.css";
import "../../../src/styles/pos-sale.css";
import { SCREEN_NAMES, type ScreenName } from "./screen-names";

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

const SCREENS: Record<ScreenName, () => ReactElement> = {
  blocked: () => <BlockedScreen reason="another_tab" onReload={() => {}} />,
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
  "sales-home": () => (
    <SalesHomeScreen
      branchName={HOSTILE_NAMES.branch}
      staffName={HOSTILE_NAMES.staff}
      status={{ connection: "server_error", pending: 123_456, needsAttention: 9_999 }}
      menu={hostileTillMenu()}
      now={Date.now()}
      onPick={() => {}}
      onOpenNeedsAttention={() => {}}
      onSwitchStaff={() => {}}
    />
  ),
  "needs-attention": () => (
    <NeedsAttentionScreen rejected={[1, 2, 3].map(rejected)} onBack={() => {}} />
  ),
};

/** Marks the page once React has rendered the screen, so the test never measures early. */
function Ready({ name, children }: { name: string; children: ReactElement }) {
  useEffect(() => {
    document.body.dataset.screenReady = name;
  }, [name]);
  return children;
}

const asked = new URLSearchParams(location.search).get("screen");
const name = SCREEN_NAMES.find((known) => known === asked);
const root = document.getElementById("root");
if (name === undefined || root === null) throw new Error(`no screen named "${asked}"`);
createRoot(root).render(<Ready name={name}>{SCREENS[name]()}</Ready>);
