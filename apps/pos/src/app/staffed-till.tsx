import { useMemo, useState } from "react";
import type { ApiResult } from "../features/api/api-result";
import {
  type BootstrapSnapshot,
  type BootstrapStaff,
  tillPlaceOf,
} from "../features/bootstrap/bootstrap-source";
import type { FloorOccupancy } from "../features/floor/floor-occupancy";
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
import { RoundSlipsScreen } from "../screens/table-order/round-slips-screen";
import { TillHeader } from "../screens/till/till-header";
import type { ShiftClosing } from "./close-shift-flow";
import { SellingModes } from "./selling-modes";
import type { RunningTill } from "./use-background-sync";

const noPasses = () => () => {};

export interface StaffedTillProps {
  snapshot: BootstrapSnapshot;
  till: RunningTill | null;
  staff: BootstrapStaff;
  status: TillSyncStatus;
  printer: PrinterPort;
  onOpenNeedsAttention(): void;
  onSwitchStaff(): void;
  onSignOut(): void;
  loadFloor(): Promise<ApiResult<FloorOccupancy>>;
}

/** A till with someone signed in: its live menu, its shift (opened first), then the sale. */
export function StaffedTill(props: StaffedTillProps) {
  const { snapshot, till, staff } = props;
  const client = till?.client ?? null;
  const menu = useTillMenu(snapshot, client);
  const now = useNow();
  const shift = useTillShift(client, snapshot.device.id);
  const place: TillPlace = useMemo(() => tillPlaceOf(snapshot), [snapshot]);
  /** The close just recorded, shown until the cashier starts the next shift. */
  const [closing, setClosing] = useState<ShiftClosing | null>(null);
  const header = (
    <TillHeader
      branchName={snapshot.branch.name}
      brandName={snapshot.brand.name}
      deviceName={snapshot.device.name}
      staffName={staff.displayName}
      shiftDate={shift.loaded ? (shift.shift?.businessDate ?? null) : undefined}
      status={props.status}
      onOpenNeedsAttention={props.onOpenNeedsAttention}
      onSwitchStaff={props.onSwitchStaff}
      onSignOut={props.onSignOut}
    />
  );
  if (closing !== null) {
    return (
      <RoundSlipsScreen
        header={header}
        title={vi.closeShift.doneTitle}
        slips={closing.slips}
        notice={closing.said === "" ? undefined : closing.said}
        backLabel={vi.closeShift.openNext}
        onBack={() => setClosing(null)}
      />
    );
  }
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
    <SellingModes
      loadFloor={props.loadFloor}
      onSyncPass={till?.sync.subscribe ?? noPasses}
      client={client}
      place={place}
      menu={menu}
      now={now}
      header={header}
      shiftId={shift.shift.id}
      cashierName={staff.displayName}
      printer={props.printer}
      onCloseShift={(run) => {
        setClosing({ slips: null, said: "" });
        run().then(setClosing, (error: unknown) => {
          console.error(error);
          setClosing({ slips: [], said: vi.closeShift.failed });
        });
      }}
    />
  );
}
