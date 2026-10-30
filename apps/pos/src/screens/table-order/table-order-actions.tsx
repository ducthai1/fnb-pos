import {
  ArrowRightLeft,
  ChefHat,
  DoorOpen,
  LayoutGrid,
  type LucideIcon,
  ReceiptText,
  Wallet,
} from "lucide-react";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";
import { useTillKey } from "../shared/use-till-key";

const T = vi.tables.order;
const K = vi.sale.keys;

export interface TableOrderActionsProps {
  /** Units the kitchen has not been sent yet. */
  owedUnits: number;
  /** The order can be priced and has something on it. */
  billable: boolean;
  /** The order is seated on the server's side (saved at least once): it can be moved. */
  saved: boolean;
  /** Nothing is left on the order (everything was removed): the table can be given back. */
  empty: boolean;
  /** The server refused one of the order's commands: only going back is offered. */
  blocked: boolean;
  onSend(): void;
  onPreBill(): void;
  onPay(): void;
  onTransfer(): void;
  onRelease(): void;
  onBack(): void;
}

/** What can be done with a table's order: send the new round, pre-bill, pay, move, leave. */
export function TableOrderActions(props: TableOrderActionsProps) {
  const { owedUnits, billable, blocked } = props;
  const canSend = !blocked && owedUnits > 0;
  const canBill = !blocked && billable;
  // The till's keys do what the buttons do, and nothing while a button is off.
  useTillKey(K.send, props.onSend, canSend);
  useTillKey(K.preBill, props.onPreBill, canBill);
  useTillKey(K.pay, props.onPay, canBill);
  const button = (
    label: string,
    onClick: () => void,
    disabled: boolean,
    tone: string,
    glyph: LucideIcon,
    key?: string,
    keyTone = "pos-kbd",
  ) => (
    <button type="button" className={`pos-button ${tone}`} disabled={disabled} onClick={onClick}>
      <Icon of={glyph} />
      {label}
      {key === undefined ? null : (
        <kbd className={keyTone} aria-hidden>
          {key}
        </kbd>
      )}
    </button>
  );
  return (
    <>
      {button(
        owedUnits > 0 ? T.sendToKitchen(owedUnits) : T.nothingToSend,
        props.onSend,
        !canSend,
        "pos-table-actions__send",
        ChefHat,
        K.send,
      )}
      {button(T.preBill, props.onPreBill, !canBill, "pos-table-actions__bill", ReceiptText, K.preBill)}
      {button(
        T.pay,
        props.onPay,
        !canBill,
        "pos-button--primary pos-cart__checkout pos-table-actions__pay",
        Wallet,
        K.pay,
        "pos-kbd pos-kbd--on-brand",
      )}
      {button(
        T.transfer,
        props.onTransfer,
        blocked || !props.saved,
        "pos-table-actions__move",
        ArrowRightLeft,
      )}
      {props.saved && props.empty && !blocked
        ? button(T.release, props.onRelease, false, "pos-table-actions__release", DoorOpen)
        : null}
      <button
        type="button"
        className="pos-button pos-button--quiet pos-table-actions__back"
        onClick={props.onBack}
      >
        <Icon of={LayoutGrid} />
        {T.backToFloor}
      </button>
    </>
  );
}
