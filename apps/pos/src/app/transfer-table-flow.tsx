import type { ReactNode } from "react";
import type { FloorArea } from "../features/floor/floor-occupancy";
import type { FloorTableView } from "../features/floor/floor-tables-view";
import type { SeatedTable } from "../features/order/counter-order";
import { useApprovalGate } from "../features/permissions/use-approval-gate";
import { vi } from "../messages/vi";
import { TransferTableScreen } from "../screens/table-order/transfer-table-screen";
import { approvalOf } from "./adjust-flow-parts";

export interface TransferTableFlowProps {
  header: ReactNode;
  /** The order whose guests move: a manager's approval is for it and no other. */
  orderId: string;
  from: SeatedTable;
  areas: readonly FloorArea[];
  tables: readonly FloorTableView[];
  /** Records the move, with the approval when one was needed; false when nothing moved. */
  move(to: SeatedTable, approvalId: string | null): Promise<boolean>;
  onMoved(to: SeatedTable): void;
  onBack(): void;
}

/**
 * Moving the guests to a free table: alone when the staff member holds transfer_table,
 * otherwise once a manager approves moving this very order. Asking needs the network, as
 * every approval does; the move itself is then recorded like any other command.
 */
export function TransferTableFlow(props: TransferTableFlowProps) {
  const gate = useApprovalGate();
  if (gate.sheet !== null) return gate.sheet;
  return (
    <TransferTableScreen
      header={props.header}
      from={props.from}
      areas={props.areas}
      tables={props.tables}
      onBack={props.onBack}
      onMove={async (to) => {
        const action = { key: "transfer_table", subject: { orderId: props.orderId } } as const;
        const said = vi.approval.actions.transferTable(props.from.name, to.name);
        const outcome = await gate.require(action, said);
        if (outcome.kind === "denied") return vi.approval.denied;
        const approval = approvalOf(outcome);
        if (approval === undefined) return null;
        if (await props.move(to, approval?.approvalId ?? null)) props.onMoved(to);
        return null;
      }}
    />
  );
}
