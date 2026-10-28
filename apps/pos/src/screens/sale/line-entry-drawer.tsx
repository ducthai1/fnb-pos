import type { PosProduct } from "@fnb/contracts";
import {
  type MeasureUnit,
  type Vnd,
  formatGrams,
  formatVnd,
  vnd,
  weighedLineAmount,
  weighedQuantity,
} from "@fnb/domain";
import { Scale, ShieldCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import {
  type EntryKind,
  QUICK_GRAMS,
  groupDigits,
  readEntry,
} from "../../features/order/line-entry-input";
import type { WeighingScale } from "../../features/order/weighing-scale";
import { vi } from "../../messages/vi";
import { CashKeypad } from "../payment/cash-keypad";
import { Icon } from "../shared/icon";
import { Alert } from "../shared/screen-frame";
import { SideDrawer } from "../shared/side-drawer";

const S = vi.sale;
const E = vi.sale.entry;

export interface LineEntryDrawerProps {
  product: PosProduct;
  kind: EntryKind;
  /** A weighed product's price per unit and that unit: what the weight is multiplied by. */
  per?: { readonly price: Vnd; readonly unit: MeasureUnit } | undefined;
  /** The digits typed so far, kept by the flow so they survive a manager's approval. */
  typed: string;
  onType(next: string): void;
  /** The line is on the order already: the button saves the change instead of adding. */
  editing: boolean;
  /** The cashier may not type a price alone: confirming asks a manager first. */
  needsManager: boolean;
  error: string | null;
  busy: boolean;
  /** A scale on the till, when one is wired in: "Đọc cân" puts its grams in the field. */
  scale?: WeighingScale | undefined;
  /** The whole đồng or whole grams typed, already within the domain's limits. */
  onConfirm(value: number): void;
  onClose(): void;
}

/**
 * The drawer a tap on an open-price or weighed product opens over the order: a big readout,
 * quick keys (the product's usual price; the weights a counter weighs most), the number keys,
 * and what the line comes to by the domain. Typed in whole đồng or whole grams only, so a
 * misplaced comma can never make 0,35 kg into 0,035 kg.
 */
export function LineEntryDrawer(props: LineEntryDrawerProps) {
  const { product, kind, per, typed, onType } = props;
  const [scaleError, setScaleError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const entry = readEntry(kind, typed);
  const amount = entry.ok ? amountOf(kind, entry.value, per) : null;
  const refusal =
    entry.ok || entry.reason === "empty" || entry.reason === "zero"
      ? null
      : entry.reason === "too_high"
        ? E.tooHigh
        : E.tooHeavy;
  const perText = per === undefined ? "" : S.pricePer(formatVnd(per.price), S.units[per.unit]);
  const confirmable = entry.ok && amount !== null && !props.busy;

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (entry.ok && confirmable) props.onConfirm(entry.value);
  }

  async function readScale(scale: WeighingScale) {
    setReading(true);
    setScaleError(null);
    try {
      onType(String(await scale.readGrams()));
    } catch {
      setScaleError(E.scaleFailed);
    } finally {
      setReading(false);
    }
  }

  const label = amount === null ? E.addEmpty : (props.editing ? E.update : E.add)(formatVnd(amount));
  return (
    <SideDrawer
      title={kind === "price" ? E.priceTitle(product.name) : E.weightTitle(product.name)}
      subtitle={kind === "price" ? E.priceSubtitle : E.weightSubtitle(perText)}
      closeLabel={E.back}
      closeDisabled={props.busy}
      onClose={props.onClose}
      foot={
        <button
          type="submit"
          form="pos-line-entry"
          className="pos-button pos-button--primary pos-button--lg pos-button--block pos-wrap"
          disabled={!confirmable}
          data-entry-amount={amount === null ? undefined : String(amount)}
        >
          {props.needsManager && kind === "price" ? <Icon of={ShieldCheck} size={20} /> : null}
          {label}
        </button>
      }
    >
      <form id="pos-line-entry" className="pos-entry" onSubmit={submit} noValidate>
        <label className="pos-entry__readout" data-entry-kind={kind}>
          <span className="pos-due__label">{kind === "price" ? E.priceField : E.weightField}</span>
          <span className="pos-entry__value">
            <input
              className="pos-entry__input"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0"
              value={groupDigits(typed)}
              aria-invalid={refusal === null ? undefined : true}
              onChange={(event) => onType(event.target.value.replace(/\D/g, "").slice(0, 11))}
            />
            <span className="pos-entry__unit" aria-hidden>
              {kind === "price" ? "₫" : "g"}
            </span>
          </span>
        </label>
        <QuickKeys {...props} onType={onType} />
        {props.scale === undefined ? null : (
          <button
            type="button"
            className="pos-button pos-entry__scale"
            disabled={reading || props.busy}
            onClick={() => void (props.scale && readScale(props.scale))}
          >
            <Icon of={Scale} size={20} />
            {reading ? E.readingScale : E.readScale}
          </button>
        )}
        <p className="pos-entry__amount" aria-live="polite" data-line-amount={amount === null ? undefined : String(amount)}>
          <span className="pos-due__label">{E.amount}</span>
          <strong>{amount === null ? "—" : formatVnd(amount)}</strong>
          {entry.ok && amount !== null ? (
            <span className="pos-entry__how pos-wrap">
              {kind === "price"
                ? E.perUnit(formatVnd(vnd(entry.value)))
                : E.weighed(formatGrams(entry.value), perText)}
            </span>
          ) : null}
        </p>
        {props.needsManager && kind === "price" ? (
          <p className="pos-hint pos-wrap">{E.needsManager}</p>
        ) : null}
        <Alert message={refusal ?? scaleError ?? props.error} />
        <CashKeypad typed={typed} onChange={onType} />
      </form>
    </SideDrawer>
  );
}

/** What the line comes to: the typed price, or the price per unit × the weight, by the domain. */
function amountOf(kind: EntryKind, value: number, per: LineEntryDrawerProps["per"]): Vnd | null {
  if (kind === "price") return vnd(value);
  if (per === undefined) return null;
  return weighedLineAmount(per.price, weighedQuantity(value, per.unit));
}

/** The product's usual price, or the weights weighed most: one tap fills the field. */
function QuickKeys(props: Pick<LineEntryDrawerProps, "product" | "kind" | "typed" | "onType">) {
  const usual = props.product.basePrice;
  if (props.kind === "price") {
    if (usual === null) return null;
    return (
      <div className="pos-quick-cash" role="group" aria-label={E.usualPrice}>
        <button
          type="button"
          className="pos-quick-cash__key"
          aria-pressed={props.typed === String(usual)}
          onClick={() => props.onType(String(usual))}
        >
          <span className="pos-entry__chip-label">{E.usualPrice}</span>
          <span className="pos-quick-cash__amount">{formatVnd(usual)}</span>
        </button>
      </div>
    );
  }
  return (
    <div className="pos-quick-cash" role="group" aria-label={E.quickWeights}>
      {QUICK_GRAMS.map((grams) => (
        <button
          key={grams}
          type="button"
          className="pos-quick-cash__key"
          aria-pressed={props.typed === String(grams)}
          onClick={() => props.onType(String(grams))}
        >
          <span className="pos-quick-cash__amount">{formatGrams(grams)}</span>
        </button>
      ))}
    </div>
  );
}
