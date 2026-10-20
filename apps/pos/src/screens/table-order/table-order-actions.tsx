import {
  ArrowRightLeft,
  ChefHat,
  LayoutGrid,
  type LucideIcon,
  ReceiptText,
  Wallet,
} from "lucide-react";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";

const T = vi.tables.order;

export interface TableOrderActionsProps {
  /** Units the kitchen has not been sent yet. */
  owedUnits: number;
  /** The order can be priced and has something on it. */
  billable: boolean;
  /** The order is seated on the server's side (saved at least once): it can be moved. */
  saved: boolean;
  /** The server refused one of the order's commands: only going back is offered. */
  blocked: boolean;
  onSend(): void;
  onPreBill(): void;
  onPay(): void;
  onTransfer(): void;
  onBack(): void;
}

/** What can be done with a table's order: send the new round, pre-bill, pay, move, leave. */
export function TableOrderActions(props: TableOrderActionsProps) {
  const { owedUnits, billable, blocked } = props;
  const button = (
    label: string,
    onClick: () => void,
    disabled: boolean,
    tone: string,
    glyph: LucideIcon,
  ) => (
    <button type="button" className={`pos-button ${tone}`} disabled={disabled} onClick={onClick}>
      <Icon of={glyph} />
      {label}
    </button>
  );
  return (
    <>
      {button(
        owedUnits > 0 ? T.sendToKitchen(owedUnits) : T.nothingToSend,
        props.onSend,
        blocked || owedUnits === 0,
        "pos-button--info pos-table-actions__send",
        ChefHat,
      )}
      {button(T.preBill, props.onPreBill, blocked || !billable, "pos-button--amber", ReceiptText)}
      {button(
        T.pay,
        props.onPay,
        blocked || !billable,
        "pos-button--primary pos-button--lg pos-table-actions__pay",
        Wallet,
      )}
      {button(T.transfer, props.onTransfer, blocked || !props.saved, "", ArrowRightLeft)}
      <button type="button" className="pos-button pos-button--quiet" onClick={props.onBack}>
        <Icon of={LayoutGrid} />
        {T.backToFloor}
      </button>
    </>
  );
}
