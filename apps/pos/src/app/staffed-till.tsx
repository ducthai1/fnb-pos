import { useMemo } from "react";
import {
  type BootstrapSnapshot,
  type BootstrapStaff,
  tillPlaceOf,
} from "../features/bootstrap/bootstrap-source";
import { useNow } from "../features/menu/use-now";
import { useTillMenu } from "../features/menu/use-till-menu";
import type { TillPlace } from "../features/order/till-command";
import type { PrinterPort } from "../features/printing/printer-port";
import { openShiftCommand } from "../features/shift/till-shift";
import { useTillShift } from "../features/shift/use-till-shift";
import type { TillSyncStatus } from "../features/sync/till-sync-status";
import { vi } from "../messages/vi";
import { OpenShiftScreen } from "../screens/open-shift/open-shift-screen";
import { ScreenFrame } from "../screens/shared/screen-frame";
import { TillHeader } from "../screens/till/till-header";
import { CounterSale } from "./counter-sale";
import type { RunningTill } from "./use-background-sync";

export interface StaffedTillProps {
  snapshot: BootstrapSnapshot;
  till: RunningTill | null;
  staff: BootstrapStaff;
  status: TillSyncStatus;
  printer: PrinterPort;
  onOpenNeedsAttention(): void;
  onSwitchStaff(): void;
}

/** A till with someone signed in: its live menu, its shift (opened first), then the sale. */
export function StaffedTill(props: StaffedTillProps) {
  const { snapshot, till, staff } = props;
  const client = till?.client ?? null;
  const menu = useTillMenu(snapshot, client);
  const now = useNow();
  const shift = useTillShift(client, snapshot.device.id);
  const place: TillPlace = useMemo(() => tillPlaceOf(snapshot), [snapshot]);
  const header = (
    <TillHeader
      branchName={snapshot.branch.name}
      staffName={staff.displayName}
      status={props.status}
      onOpenNeedsAttention={props.onOpenNeedsAttention}
      onSwitchStaff={props.onSwitchStaff}
    />
  );
  if (client === null || !shift.loaded) {
    return (
      <ScreenFrame title={vi.checkout.openShift.checking}>
        {header}
        <div className="pos-spinner" aria-hidden="true" />
      </ScreenFrame>
    );
  }
  if (shift.shift === null) {
    return (
      <OpenShiftScreen
        header={header}
        onOpen={async (counts) => {
          await client.enqueue(openShiftCommand(place, staff.id, counts, Date.now()));
        }}
      />
    );
  }
  return (
    <CounterSale
      client={client}
      place={place}
      menu={menu}
      now={now}
      header={header}
      shiftId={shift.shift.id}
      cashierName={staff.displayName}
      printer={props.printer}
    />
  );
}
