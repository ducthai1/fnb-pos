import { formatVnd } from "@fnb/domain";
import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from "react";
import { type CartLine, MAX_LINE_QUANTITY } from "../../features/order/counter-order";
import { type CartView, lineAmountOf } from "../../features/order/cart-view";
import type { OrderLine } from "@fnb/domain";
import { vi } from "../../messages/vi";
import { CartLineDetails } from "./cart-line-details";
import { type LineAdjustments, LineMenuButton, LineTools } from "./cart-line-tools";
import { ProductMark } from "./product-photo";
import { QuantityStepper } from "./quantity-stepper";

export type { LineAdjustments } from "./cart-line-tools";

const S = vi.sale;

export interface CartRowActions {
  onQuantity(lineId: string, quantity: number): void;
  onRemove(lineId: string): void;
}

/**
 * One item in one row: its photo, its name with options and note in small type under it,
 * the − n + beside it and the amount on the right; the rest (remove, void, discount) behind
 * the row's "…". `badge` says where it stands with the kitchen; a `locked` one (held as
 * stored) offers no stepper and no remove: taking units off it is a void.
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
  const locked = props.locked === true;
  const [open, setOpen] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const toolsId = useId();
  const item = priced.find((candidate) => candidate.id === line.lineId);
  const name = item?.nameSnapshot ?? props.view.nameOf(line);
  const photo = props.view.photoOf(line);
  const priceOf = (lineId: string) =>
    props.view.kind === "priced" ? formatVnd(lineAmountOf(props.view.priced, lineId)) : "";
  const remove = locked ? undefined : () => props.onRemove(line.lineId);
  const hasTools = remove !== undefined || props.adjust !== undefined;
  // Esc inside the open actions closes them and puts the focus back on the "…".
  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !open) return;
    event.stopPropagation();
    setOpen(false);
    more.current?.focus();
  };
  return (
    <li
      className="pos-cart-line"
      data-cart-line={line.lineId}
      data-locked={locked}
      onKeyDown={closeOnEscape}
    >
      <div className="pos-cart-line__row">
        {/* Only a photo: a line without one keeps the plain layout, no coloured square. */}
        {photo === undefined ? null : (
          <ProductMark className="pos-cart-line__photo" name={name} imageUrl={photo} />
        )}
        <span className="pos-cart-line__name pos-wrap">
          {name}
          {locked ? ` ×${line.quantity}` : ""}
        </span>
        <div className="pos-cart-line__details">
          <CartLineDetails line={line} priced={priced} priceOf={priceOf} badge={props.badge} />
        </div>
        {locked ? null : (
          <div className="pos-cart-line__step">
            <QuantityStepper
              compact
              label={S.lineQuantity(name)}
              name={name}
              value={line.quantity}
              max={MAX_LINE_QUANTITY}
              onChange={(next) => props.onQuantity(line.lineId, next)}
            />
          </div>
        )}
        <span className="pos-cart-line__amount">{priceOf(line.lineId)}</span>
        {hasTools ? (
          <LineMenuButton
            name={name}
            open={open}
            controls={toolsId}
            buttonRef={more}
            onToggle={() => setOpen(!open)}
          />
        ) : null}
      </div>
      {open && hasTools ? (
        <LineTools
          id={toolsId}
          name={name}
          lineId={line.lineId}
          onRemove={remove}
          adjust={props.adjust}
        />
      ) : null}
    </li>
  );
}
