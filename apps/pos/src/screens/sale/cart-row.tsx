import {
  type OrderLine,
  QUANTITY_SCALE,
  formatVnd,
  negateQuantity,
  negateVnd,
  quantityToDecimalString,
} from "@fnb/domain";
import type { ReactNode } from "react";
import { discountAmountOf } from "../../features/order-adjust/describe-discount";
import { type CartLine, MAX_LINE_QUANTITY } from "../../features/order/counter-order";
import { type CartView, lineAmountOf } from "../../features/order/cart-view";
import { vi } from "../../messages/vi";
import { QuantityStepper } from "./quantity-stepper";

const S = vi.sale;
const C = vi.adjust.cart;

export interface CartRowActions {
  onQuantity(lineId: string, quantity: number): void;
  onRemove(lineId: string): void;
}

/** What can be done to a saved item beyond the stepper: void it, discount it. */
export interface LineAdjustments {
  onVoid(lineId: string): void;
  onDiscount(lineId: string): void;
}

/**
 * One item with its options, note, its discount and what was cancelled of it. `badge` says
 * where it stands with the kitchen; a `locked` one (held as stored) offers no stepper and no
 * remove: taking units off it is a void.
 */
export function CartRow(
  props: {
    line: CartLine;
    priced: readonly OrderLine[];
    view: CartView;
    badge?: ReactNode;
    locked?: boolean;
    adjust?: LineAdjustments | undefined;
  } & CartRowActions,
) {
  const { line, priced } = props;
  const item = priced.find((candidate) => candidate.id === line.lineId);
  const under = priced.filter((candidate) => candidate.parentLineId === line.lineId);
  const children = under.filter((candidate) => candidate.lineType !== "discount");
  const discounts = under.filter((candidate) => candidate.lineType === "discount");
  const cancels = priced.filter((candidate) => candidate.reversesLineId === line.lineId);
  const name = item?.nameSnapshot ?? props.view.nameOf(line);
  const priceOf = (lineId: string) =>
    props.view.kind === "priced" ? formatVnd(lineAmountOf(props.view.priced, lineId)) : "";
  return (
    <li className="pos-cart-line" data-cart-line={line.lineId}>
      <div className="pos-cart-line__head">
        <span className="pos-cart-line__name pos-wrap">
          {name}
          {props.locked === true ? ` ×${line.quantity}` : ""}
        </span>
        <span className="pos-cart-line__amount">{priceOf(line.lineId)}</span>
      </div>
      {children.length === 0 ? null : (
        <ul className="pos-cart-line__children">
          {children.map((child) => (
            <li key={child.id} className="pos-wrap">
              + {child.nameSnapshot}
              {child.quantity === QUANTITY_SCALE
                ? ""
                : ` ×${quantityToDecimalString(child.quantity)}`}
            </li>
          ))}
        </ul>
      )}
      {discounts.length === 0 ? null : (
        <p className="pos-cart-line__head" data-line-discount={line.lineId}>
          <span>{C.lineDiscount}</span>
          <span>{formatVnd(negateVnd(discountAmountOf(discounts)))}</span>
        </p>
      )}
      {cancels.map((cancel) => (
        <p key={cancel.id} className="pos-cart-line__head">
          <span>{C.voided(Number(negateQuantity(cancel.quantity) / QUANTITY_SCALE))}</span>
          <span>{priceOf(cancel.id)}</span>
        </p>
      ))}
      {line.note === null ? null : (
        <p className="pos-cart-line__note pos-wrap">
          {S.note}: {line.note}
        </p>
      )}
      {props.badge}
      {props.locked === true ? null : (
        <div className="pos-cart-line__actions">
          <QuantityStepper
            label={S.lineQuantity(name)}
            name={name}
            value={line.quantity}
            max={MAX_LINE_QUANTITY}
            onChange={(next) => props.onQuantity(line.lineId, next)}
          />
          <button
            type="button"
            className="pos-button pos-button--quiet"
            aria-label={S.remove(name)}
            onClick={() => props.onRemove(line.lineId)}
          >
            ✕
          </button>
        </div>
      )}
      {props.adjust === undefined ? null : (
        <LineTools name={name} lineId={line.lineId} adjust={props.adjust} />
      )}
    </li>
  );
}

function LineTools(props: { name: string; lineId: string; adjust: LineAdjustments }) {
  const T = vi.adjust.tools;
  return (
    <div className="pos-line-tools">
      <button
        type="button"
        className="pos-button pos-button--quiet"
        aria-label={T.void(props.name)}
        onClick={() => props.adjust.onVoid(props.lineId)}
      >
        {T.voidShort}
      </button>
      <button
        type="button"
        className="pos-button pos-button--quiet"
        aria-label={T.discount(props.name)}
        onClick={() => props.adjust.onDiscount(props.lineId)}
      >
        {T.discountShort}
      </button>
    </div>
  );
}
