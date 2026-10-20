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
  ) => (
    <button type="button" className={`pos-button ${tone}`} disabled={disabled} onClick={onClick}>
      <Icon of={glyph} />
      {label}
      {key === undefined ? null : (
        <kbd className="pos-kbd" aria-hidden>
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
        "pos-button--info pos-table-actions__send",
        ChefHat,
        K.send,
      )}
      {button(T.preBill, props.onPreBill, !canBill, "pos-button--amber", ReceiptText, K.preBill)}
      {button(
        T.pay,
        props.onPay,
        !canBill,
        "pos-button--primary pos-button--lg pos-table-actions__pay",
        Wallet,
        K.pay,
      )}
      {button(T.transfer, props.onTransfer, blocked || !props.saved, "", ArrowRightLeft)}
      <button type="button" className="pos-button pos-button--quiet" onClick={props.onBack}>
        <Icon of={LayoutGrid} />
        {T.backToFloor}
      </button>
    </>
  );
}
