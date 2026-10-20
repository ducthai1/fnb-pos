import { useMemo, useState } from "react";
import { openingFromStored } from "../features/order/order-opening";
import type { ApiResult } from "../features/api/api-result";
import type { FloorOccupancy } from "../features/floor/floor-occupancy";
import { orderNumbers } from "../features/order/device-order-number";
import { useCounterOrder } from "../features/order/use-counter-order";
import { type SellingMode, SellingModeSwitch } from "../screens/till/selling-mode-switch";
import { TillTools } from "../screens/till/till-tools";
import { CounterSale, type CounterSaleProps } from "./counter-sale";
import { OrderHistoryFlow } from "./order-history-flow";
import { TableService } from "./table-service";

export interface SellingModesProps extends Omit<CounterSaleProps, "session" | "modeSwitch"> {
  /** GET /floor/occupancy with the till's credential. */
  loadFloor(): Promise<ApiResult<FloorOccupancy>>;
  /** Called after each sync pass; returns the unsubscribe. */
  onSyncPass(listener: () => void): () => void;
}

/**
 * Selling at the counter and, when the branch serves at tables (its `tables` switch), the
 * floor beside it. The counter's order lives here, so a look at the floor never loses it,
 * and both draw order numbers from one source, so they never give out the same one.
 */
export function SellingModes(props: SellingModesProps) {
  const { client, place, menu } = props;
  const numbers = useMemo(() => orderNumbers(client, place.deviceId), [client, place.deviceId]);
  const counter = useCounterOrder(client, place, menu, numbers);
  const [mode, setMode] = useState<SellingMode | "history">("counter");
  const tablesOn = menu.config.flags.tables === true;
  const modeSwitch = (
    <>
      {tablesOn && mode !== "history" ? <SellingModeSwitch mode={mode} onChange={setMode} /> : null}
      <TillTools onHistory={() => setMode("history")} />
    </>
  );
  if (mode === "history") {
    return (
      <OrderHistoryFlow
        {...props}
        numbers={numbers}
        onReopenCounter={(order) => {
          counter.reopen(openingFromStored(menu, order));
          setMode("counter");
        }}
        onReopenTables={() => setMode(tablesOn ? "tables" : "counter")}
        onBack={() => setMode("counter")}
      />
    );
  }
  if (tablesOn && mode === "tables") {
    return <TableService {...props} numbers={numbers} modeSwitch={modeSwitch} />;
  }
  return <CounterSale {...props} session={counter} modeSwitch={modeSwitch} />;
}
