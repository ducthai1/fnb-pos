import type { TillSyncStatus } from "../../features/sync/till-sync-status";
import { vi } from "../../messages/vi";
import { ScreenFrame } from "../shared/screen-frame";
import { SyncStatusBadges } from "./sync-status-badges";

export interface SalesHomeScreenProps {
  branchName: string;
  staffName: string;
  status: TillSyncStatus;
  onOpenNeedsAttention(): void;
  onSwitchStaff(): void;
}

/** The selling screen's frame; the order screen itself comes later. */
export function SalesHomeScreen(props: SalesHomeScreenProps) {
  return (
    <ScreenFrame title={vi.sales.title}>
      <SyncStatusBadges status={props.status} onOpenNeedsAttention={props.onOpenNeedsAttention} />
      <p className="pos-hint pos-wrap">{props.branchName}</p>
      <p className="pos-signed-in pos-wrap">{vi.sales.signedInAs(props.staffName)}</p>
      <section className="pos-card">
        <p>{vi.sales.placeholder}</p>
      </section>
      <button type="button" className="pos-button pos-button--quiet" onClick={props.onSwitchStaff}>
        {vi.sales.switchStaff}
      </button>
    </ScreenFrame>
  );
}
