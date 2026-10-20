import type { BootstrapSnapshot } from "../features/bootstrap/bootstrap-source";
import { useNow } from "../features/menu/use-now";
import { useTillMenu } from "../features/menu/use-till-menu";
import type { TillSyncStatus } from "../features/sync/till-sync-status";
import { SalesHomeScreen } from "../screens/sales-home/sales-home-screen";
import type { RunningTill } from "./use-background-sync";

export interface StaffedTillProps {
  snapshot: BootstrapSnapshot;
  till: RunningTill | null;
  staffName: string;
  status: TillSyncStatus;
  onOpenNeedsAttention(): void;
  onSwitchStaff(): void;
}

/** A till with someone signed in: the live menu, then the sale. */
export function StaffedTill(props: StaffedTillProps) {
  const menu = useTillMenu(props.snapshot, props.till?.client ?? null);
  const now = useNow();
  return (
    <SalesHomeScreen
      branchName={props.snapshot.branch.name}
      staffName={props.staffName}
      status={props.status}
      menu={menu}
      now={now}
      onPick={() => {}}
      onOpenNeedsAttention={props.onOpenNeedsAttention}
      onSwitchStaff={props.onSwitchStaff}
    />
  );
}
