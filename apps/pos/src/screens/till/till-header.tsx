import type { TillSyncStatus } from "../../features/sync/till-sync-status";
import { vi } from "../../messages/vi";
import { SyncStatusBadges } from "../sales-home/sync-status-badges";

export interface TillHeaderProps {
  branchName: string;
  staffName: string;
  status: TillSyncStatus;
  onOpenNeedsAttention(): void;
  onSwitchStaff(): void;
  onSignOut(): void;
}

/** On every screen of a signed-in till: where, who, and whether it is in sync. */
export function TillHeader(props: TillHeaderProps) {
  return (
    <header className="pos-till-header">
      <SyncStatusBadges status={props.status} onOpenNeedsAttention={props.onOpenNeedsAttention} />
      <div className="pos-till-header__who">
        <p className="pos-hint pos-wrap">{props.branchName}</p>
        <p className="pos-signed-in pos-wrap">{vi.sales.signedInAs(props.staffName)}</p>
        <button
          type="button"
          className="pos-button pos-button--quiet"
          onClick={props.onSwitchStaff}
        >
          {vi.sales.switchStaff}
        </button>
        <button type="button" className="pos-button pos-button--quiet" onClick={props.onSignOut}>
          {vi.session.signOut}
        </button>
      </div>
    </header>
  );
}
