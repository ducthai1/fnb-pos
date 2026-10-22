import { CalendarClock, LogOut, Store, UserRoundCog } from "lucide-react";
import type { TillSyncStatus } from "../../features/sync/till-sync-status";
import { vi } from "../../messages/vi";
import { SyncStatusBadges } from "../sales-home/sync-status-badges";
import { Icon } from "../shared/icon";
import { StaffAvatar } from "../shared/staff-avatar";
import { ThemeMenu } from "./theme-menu";
import { useTillBarNav } from "./till-bar-nav";

export interface TillHeaderProps {
  branchName: string;
  /** The shop's brand and this till's own name, when the till knows them. */
  brandName?: string | undefined;
  deviceName?: string | undefined;
  staffName: string;
  /** The open shift's business date; null once known that no shift is open. */
  shiftDate?: string | null | undefined;
  status: TillSyncStatus;
  onOpenNeedsAttention(): void;
  onSwitchStaff(): void;
  onSignOut(): void;
}

/** On every screen of a signed-in till: where, who, which shift, and whether it is in sync. */
export function TillHeader(props: TillHeaderProps) {
  const nav = useTillBarNav();
  return (
    <header className="pos-topbar" aria-label={vi.shell.barLabel}>
      <div className="pos-topbar__place">
        <span className="pos-topbar__mark">
          <Icon of={Store} size={22} />
        </span>
        <div className="pos-topbar__names">
          {props.brandName === undefined ? null : (
            <p className="pos-topbar__brand pos-clip">{props.brandName}</p>
          )}
          <p className="pos-topbar__branch pos-clip">
            {props.deviceName === undefined
              ? props.branchName
              : vi.shell.placeLine(props.branchName, props.deviceName)}
          </p>
        </div>
      </div>
      {nav}
      <SyncStatusBadges status={props.status} onOpenNeedsAttention={props.onOpenNeedsAttention} />
      <div className="pos-topbar__who">
        <StaffAvatar id={props.staffName} name={props.staffName} />
        <div className="pos-topbar__person">
          <p className="pos-signed-in">
            <span className="pos-sr-only">{vi.sales.signedInAs(props.staffName)}</span>
            <span className="pos-clip" aria-hidden="true">
              {props.staffName}
            </span>
          </p>
          {props.shiftDate === undefined ? null : (
            <p className="pos-topbar__shift" data-open={props.shiftDate !== null}>
              <Icon of={CalendarClock} size={16} />
              {props.shiftDate === null ? vi.shell.noShift : vi.shell.shiftOf(props.shiftDate)}
            </p>
          )}
        </div>
        <div className="pos-topbar__actions">
          <ThemeMenu />
          <button
            type="button"
            className="pos-button pos-button--quiet pos-button--sm"
            onClick={props.onSwitchStaff}
          >
            <Icon of={UserRoundCog} />
            {vi.sales.switchStaff}
          </button>
          <button
            type="button"
            className="pos-button pos-button--quiet pos-button--sm"
            onClick={props.onSignOut}
          >
            <Icon of={LogOut} />
            {vi.session.signOut}
          </button>
        </div>
      </div>
    </header>
  );
}
