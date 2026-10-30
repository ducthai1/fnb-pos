import { type Vnd, formatVnd } from "@fnb/domain";
import { type ReactNode, useState } from "react";
import type { DiscountInput } from "../../features/order-adjust/discount-adjustment";
import { DISCOUNT_PRESETS, typedDiscount } from "../../features/order-adjust/typed-discount";
import { vi } from "../../messages/vi";
import { percentOf } from "../../messages/vi-approval";
import { Alert, ScreenFrame } from "../shared/screen-frame";
import { useLeaveThen } from "../shared/use-leave-motion";

const T = vi.adjust.discount;

export type DiscountPreview =
  { readonly discount: Vnd; readonly amountDue: Vnd } | { readonly refused: string };

export interface DiscountScreenProps {
  header: ReactNode;
  title: string;
  /** What the discount comes to and what is then due, by the domain; or why it cannot be. */
  preview(input: DiscountInput): DiscountPreview;
  onConfirm(input: DiscountInput): Promise<string | null>;
  /** Present when the item or the order already has a discount: takes it off. */
  onRemove?: (() => Promise<string | null>) | undefined;
  onBack(): void;
  /** The step's work is done and it is playing its leaving movement before the flow moves on. */
  closing?: boolean;
}

/** A discount on one item or on the whole order: a quick rate, a typed rate, or an amount. */
export function DiscountScreen(props: DiscountScreenProps) {
  // Back plays the step's leaving movement before the flow closes it.
  const { leaving, leave } = useLeaveThen(props.onBack, "--t-exit");
  const [mode, setMode] = useState<"percent" | "amount">("percent");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = typedDiscount(mode, typed);
  const remove = props.onRemove;
  const preview = input === null ? null : props.preview(input);

  async function run(action: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    const refused = await action();
    setBusy(false);
    setError(refused);
  }

  return (
    <ScreenFrame
      enter="sheet"
      leaving={leaving || props.closing === true}
      title={props.title}
      dock={
        <>
          {preview === null ? null : "refused" in preview ? (
            <Alert message={preview.refused} />
          ) : (
            <p className="pos-total" data-discount-due={String(preview.amountDue)}>
              {T.preview(formatVnd(preview.discount), formatVnd(preview.amountDue))}
            </p>
          )}
          <Alert message={error} />
          <div className="pos-actions">
            <button type="button" className="pos-button" onClick={leave}>
              {vi.adjust.back}
            </button>
            {remove === undefined ? null : (
              <button
                type="button"
                className="pos-button"
                disabled={busy}
                onClick={() => void run(remove)}
              >
                {T.remove}
              </button>
            )}
            <button
              type="button"
              className="pos-button pos-button--primary"
              disabled={busy || preview === null || "refused" in preview}
              onClick={() => {
                if (input !== null) void run(() => props.onConfirm(input));
              }}
            >
              {T.confirm}
            </button>
          </div>
        </>
      }
    >
      {props.header}
      <div className="pos-tabs" role="group" aria-label={props.title}>
        {(["percent", "amount"] as const).map((each) => (
          <button
            key={each}
            type="button"
            className="pos-button pos-tab"
            aria-pressed={mode === each}
            onClick={() => {
              setMode(each);
              setTyped("");
            }}
          >
            {each === "percent" ? T.byPercent : T.byAmount}
          </button>
        ))}
      </div>
      {mode === "percent" ? (
        <ul className="pos-choices">
          {DISCOUNT_PRESETS.map((rate) => (
            <li key={rate}>
              <button
                type="button"
                className="pos-button"
                aria-pressed={input?.kind === "percent" && input.rate === rate}
                onClick={() => setTyped(percentOf(rate).replace("%", ""))}
              >
                {T.percentPreset(percentOf(rate))}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <label className="pos-field">
        <span className="pos-field__label">
          {mode === "percent" ? T.typedPercent : T.typedAmount}
        </span>
        <input
          className="pos-input"
          inputMode="decimal"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
      </label>
      {typed !== "" && input === null ? <Alert message={T.unreadable} /> : null}
    </ScreenFrame>
  );
}
