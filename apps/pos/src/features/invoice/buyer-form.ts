import { type EInvoiceBuyer, einvoiceBuyerSchema, taxCodeSchema } from "@fnb/contracts";

/** A company wanting its tax code on the invoice, or a person giving a citizen id or phone. */
export type BuyerKind = "company" | "person";

/** The buyer form as the cashier typed it. */
export interface BuyerForm {
  readonly kind: BuyerKind;
  readonly taxCode: string;
  readonly name: string;
  readonly address: string;
  readonly citizenId: string;
  readonly phone: string;
  readonly email: string;
}

export type BuyerField = Exclude<keyof BuyerForm, "kind">;

export type BuyerProblem =
  | "tax_code"
  | "company_name_missing"
  | "citizen_id"
  | "phone"
  | "person_unnamed"
  | "email"
  | "too_long";

export type BuyerFormResult =
  | { readonly ok: true; readonly buyer: EInvoiceBuyer }
  | { readonly ok: false; readonly problems: Partial<Record<BuyerField, BuyerProblem>> };

export const EMPTY_BUYER_FORM: BuyerForm = {
  kind: "company",
  taxCode: "",
  name: "",
  address: "",
  citizenId: "",
  phone: "",
  email: "",
};

// Each field is checked by the contract's own rule, so the till refuses exactly what the
// server would, and says which field is wrong instead of losing the whole command.
const FIELDS = einvoiceBuyerSchema.innerType().shape;
const LONGEST = { name: 200, address: 300 } as const;

/** Digits as people type them, with the spaces and dots between groups dropped. */
const compact = (typed: string) => typed.replace(/[\s.]/g, "");

/**
 * A tax code as the contract stores it: ten digits, a branch's ten + "-" + three, or a
 * person's twelve. Thirteen digits typed without the dash are a branch's code.
 */
export function normalizeTaxCode(typed: string): string {
  const code = compact(typed);
  return /^\d{13}$/.test(code) ? `${code.slice(0, 10)}-${code.slice(10)}` : code;
}

/** What the customer gave, as order.set_buyer_info carries it, or what is wrong with it. */
export function buyerFromForm(form: BuyerForm): BuyerFormResult {
  const problems: Partial<Record<BuyerField, BuyerProblem>> = {};
  const buyer: Record<string, string> = {};
  const take = (field: BuyerField, value: string, valid: boolean, problem: BuyerProblem) => {
    if (value === "") return;
    if (valid) buyer[field] = value;
    else problems[field] = problem;
  };
  const name = form.name.trim();
  const address = form.address.trim();
  const email = form.email.trim();
  take("name", name, name.length <= LONGEST.name, "too_long");
  take("address", address, address.length <= LONGEST.address, "too_long");
  take("email", email, FIELDS.email.safeParse(email).success, "email");
  if (form.kind === "company") {
    const taxCode = normalizeTaxCode(form.taxCode);
    take("taxCode", taxCode, taxCodeSchema.safeParse(taxCode).success, "tax_code");
    if (taxCode === "") problems.taxCode = "tax_code";
    if (name === "") problems.name = "company_name_missing";
  } else {
    const citizenId = compact(form.citizenId);
    const phone = compact(form.phone);
    take("citizenId", citizenId, FIELDS.citizenId.safeParse(citizenId).success, "citizen_id");
    take("phone", phone, FIELDS.phone.safeParse(phone).success, "phone");
    if (citizenId === "" && phone === "") problems.citizenId = "person_unnamed";
  }
  if (Object.keys(problems).length > 0) return { ok: false, problems };
  const parsed = einvoiceBuyerSchema.safeParse(buyer);
  return parsed.success
    ? { ok: true, buyer: parsed.data }
    : { ok: false, problems: { citizenId: "person_unnamed" } };
}

/** The form filled with details given earlier, to change them. */
export function formOfBuyer(buyer: EInvoiceBuyer | null): BuyerForm {
  if (buyer === null) return EMPTY_BUYER_FORM;
  return {
    kind: buyer.taxCode === undefined ? "person" : "company",
    taxCode: buyer.taxCode ?? "",
    name: buyer.name ?? "",
    address: buyer.address ?? "",
    citizenId: buyer.citizenId ?? "",
    phone: buyer.phone ?? "",
    email: buyer.email ?? "",
  };
}
