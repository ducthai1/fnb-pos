import type { EInvoiceBuyer } from "@fnb/contracts";
import { type FormEvent, type ReactNode, useState } from "react";
import {
  type BuyerField,
  type BuyerForm,
  type BuyerKind,
  type BuyerProblem,
  buyerFromForm,
  formOfBuyer,
} from "../../features/invoice/buyer-form";
import { vi } from "../../messages/vi";
import { Alert, ScreenFrame } from "../shared/screen-frame";
import { BuyerTextField } from "./buyer-text-field";

const I = vi.invoice;
const F = I.fields;
const KINDS: readonly BuyerKind[] = ["company", "person"];

export interface BuyerInfoScreenProps {
  header: ReactNode;
  /** Details given earlier for this order, or null for a retail customer. */
  buyer: EInvoiceBuyer | null;
  /** Records the details (null: back to a retail customer) on the order. */
  onSave(buyer: EInvoiceBuyer | null): Promise<void>;
  onBack(): void;
}

/**
 * Who the e-invoice is for: a company by its tax code, name and address, or a person by a
 * citizen id or phone. Each field is checked by the order.set_buyer_info contract's own
 * rule before anything is recorded, so the server never refuses what the cashier typed.
 */
export function BuyerInfoScreen({ header, buyer, onSave, onBack }: BuyerInfoScreenProps) {
  const [form, setForm] = useState<BuyerForm>(() => formOfBuyer(buyer));
  const [problems, setProblems] = useState<Partial<Record<BuyerField, BuyerProblem>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const field = (name: BuyerField, label: string, maxLength: number, numeric = false) => {
    const problem = problems[name];
    return (
      <BuyerTextField
        label={label}
        name={`buyer-${name}`}
        value={form[name]}
        problem={problem === undefined ? null : I.problems[problem]}
        inputMode={numeric ? "numeric" : "text"}
        maxLength={maxLength}
        onChange={(value) => setForm({ ...form, [name]: value })}
      />
    );
  };

  async function save(next: EInvoiceBuyer | null) {
    setBusy(true);
    setError(null);
    try {
      await onSave(next);
    } catch {
      setBusy(false);
      setError(I.failed);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const result = buyerFromForm(form);
    if (!result.ok) return setProblems(result.problems);
    setProblems({});
    void save(result.buyer);
  }

  return (
    <ScreenFrame title={I.title}>
      {header}
      <p className="pos-hint pos-wrap">{I.hint}</p>
      <div className="pos-tabs" role="group" aria-label={I.title}>
        {KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            className="pos-tab"
            aria-pressed={form.kind === kind}
            onClick={() => {
              setForm({ ...form, kind });
              setProblems({});
            }}
          >
            {I.kinds[kind]}
          </button>
        ))}
      </div>
      <form className="pos-form" onSubmit={submit} noValidate>
        {form.kind === "company" ? (
          <>
            {field("taxCode", F.taxCode, 20, true)}
            {field("name", F.name, 200)}
            {field("address", F.address, 300)}
          </>
        ) : (
          <>
            {field("citizenId", F.citizenId, 20, true)}
            {field("phone", F.phone, 20, true)}
            {field("name", F.personName, 200)}
            {field("address", F.address, 300)}
          </>
        )}
        {field("email", F.email, 200)}
        <Alert message={error} />
        <div className="pos-actions">
          <button type="button" className="pos-button" onClick={onBack} disabled={busy}>
            {I.back}
          </button>
          {buyer === null ? null : (
            <button
              type="button"
              className="pos-button"
              onClick={() => void save(null)}
              disabled={busy}
            >
              {I.clear}
            </button>
          )}
          <button type="submit" className="pos-button pos-button--primary" disabled={busy}>
            {busy ? I.saving : I.save}
          </button>
        </div>
      </form>
    </ScreenFrame>
  );
}
