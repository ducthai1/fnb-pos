import { vi } from "../../messages/vi";

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
  const button = (label: string, onClick: () => void, disabled: boolean, primary = false) => (
    <button
      type="button"
      className={primary ? "pos-button pos-button--primary" : "pos-button"}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
  return (
    <>
      {button(
        owedUnits > 0 ? T.sendToKitchen(owedUnits) : T.nothingToSend,
        props.onSend,
        blocked || owedUnits === 0,
        true,
      )}
      {button(T.preBill, props.onPreBill, blocked || !billable)}
      {button(T.pay, props.onPay, blocked || !billable, true)}
      {button(T.transfer, props.onTransfer, blocked || !props.saved)}
      <button type="button" className="pos-button pos-button--quiet" onClick={props.onBack}>
        {T.backToFloor}
      </button>
    </>
  );
}
