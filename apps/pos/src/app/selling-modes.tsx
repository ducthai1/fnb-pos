import { useMemo, useState } from "react";
import type { ApiResult } from "../features/api/api-result";
import type { FloorOccupancy } from "../features/floor/floor-occupancy";
import { orderNumbers } from "../features/order/device-order-number";
import { openingFromStored } from "../features/order/order-opening";
import { useCounterOrder } from "../features/order/use-counter-order";
import { type SellingMode, SellingModeSwitch } from "../screens/till/selling-mode-switch";
import { type TillTool, TillTools } from "../screens/till/till-tools";
import { CashMoveFlow } from "./cash-move-flow";
import { CloseShiftFlow, type ShiftClosing } from "./close-shift-flow";
import { CounterSale, type CounterSaleProps } from "./counter-sale";
import { OrderHistoryFlow } from "./order-history-flow";
import { TableService } from "./table-service";

export interface SellingModesProps extends Omit<CounterSaleProps, "session" | "modeSwitch"> {
  /** GET /floor/occupancy with the till's credential. */
  loadFloor(): Promise<ApiResult<FloorOccupancy>>;
  /** Called after each sync pass; returns the unsubscribe. */
  onSyncPass(listener: () => void): () => void;
  /** Records the shift's close outside these screens, which end with the shift. */
  onCloseShift(run: () => Promise<ShiftClosing>): void;
}

/**
 * Selling at the counter and, when the branch serves at tables (its `tables` switch), the
 * floor beside it, with the till's tools: the day's orders, the drawer, closing the shift.
 * The counter's order lives here, so a look at the floor or a tool never loses it, and both
 * draw order numbers from one source, so they never give out the same one.
 */
export function SellingModes(props: SellingModesProps) {
  const { client, place, menu } = props;
  const numbers = useMemo(() => orderNumbers(client, place.deviceId), [client, place.deviceId]);
  const counter = useCounterOrder(client, place, menu, numbers);
  const [mode, setMode] = useState<SellingMode>("counter");
  const [tool, setTool] = useState<TillTool | null>(null);
  const tablesOn = menu.config.flags.tables === true;
  const modeSwitch = (
    <>
      {tablesOn ? <SellingModeSwitch mode={mode} onChange={setMode} /> : null}
      <TillTools onOpen={setTool} />
    </>
  );
  const leave = () => setTool(null);
  if (tool === "history") {
    return (
      <OrderHistoryFlow
        {...props}
        numbers={numbers}
        onReopenCounter={(order) => {
          counter.reopen(openingFromStored(menu, order));
          setMode("counter");
          leave();
        }}
        onReopenTables={() => {
          setMode(tablesOn ? "tables" : "counter");
          leave();
        }}
        onBack={leave}
      />
    );
  }
  if (tool === "cash") return <CashMoveFlow {...props} onBack={leave} />;
  if (tool === "close") {
    return <CloseShiftFlow {...props} onBack={leave} onClose={props.onCloseShift} />;
  }
  if (tablesOn && mode === "tables") {
    return <TableService {...props} numbers={numbers} modeSwitch={modeSwitch} />;
  }
  return <CounterSale {...props} session={counter} modeSwitch={modeSwitch} />;
}
