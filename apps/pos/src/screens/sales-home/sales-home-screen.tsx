import type { PosProduct } from "@fnb/contracts";
import type { TillMenu } from "../../features/menu/till-menu";
import type { TillSyncStatus } from "../../features/sync/till-sync-status";
import { vi } from "../../messages/vi";
import { MenuPanel } from "../sale/menu-panel";
import { ScreenFrame } from "../shared/screen-frame";
import { SyncStatusBadges } from "./sync-status-badges";

export interface SalesHomeScreenProps {
  branchName: string;
  staffName: string;
  status: TillSyncStatus;
  menu: TillMenu;
  now: number;
  onPick(product: PosProduct): void;
  onOpenNeedsAttention(): void;
  onSwitchStaff(): void;
}

/** The selling screen: who is at the till, its sync state, and the menu to sell from. */
export function SalesHomeScreen(props: SalesHomeScreenProps) {
  return (
    <ScreenFrame title={vi.sales.title}>
      <SyncStatusBadges status={props.status} onOpenNeedsAttention={props.onOpenNeedsAttention} />
      <p className="pos-hint pos-wrap">{props.branchName}</p>
      <p className="pos-signed-in pos-wrap">{vi.sales.signedInAs(props.staffName)}</p>
      <MenuPanel menu={props.menu} now={props.now} onPick={props.onPick} />
      <button type="button" className="pos-button pos-button--quiet" onClick={props.onSwitchStaff}>
        {vi.sales.switchStaff}
      </button>
    </ScreenFrame>
  );
}
