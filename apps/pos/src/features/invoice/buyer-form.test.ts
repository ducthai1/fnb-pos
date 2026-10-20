import { setBuyerInfoPayloadSchema } from "@fnb/contracts";
import { describe, expect, it } from "vitest";
import { type BuyerForm, EMPTY_BUYER_FORM, buyerFromForm, formOfBuyer } from "./buyer-form";

const company = (change: Partial<BuyerForm> = {}): BuyerForm => ({
  ...EMPTY_BUYER_FORM,
  kind: "company",
  taxCode: "0312345678",
  name: "Công ty TNHH Khách Hàng",
  address: "5 Nguyễn Huệ, Quận 1",
  ...change,
});
const person = (change: Partial<BuyerForm> = {}): BuyerForm => ({
  ...EMPTY_BUYER_FORM,
  kind: "person",
  ...change,
});
const problemsOf = (form: BuyerForm) => {
  const result = buyerFromForm(form);
  return result.ok ? {} : result.problems;
};

describe("the buyer a company's invoice names", () => {
  it.each([
    ["ten digits", "0312345678", "0312345678"],
    ["a branch's code with its dash", "0312345678-001", "0312345678-001"],
    ["a branch's thirteen digits typed without the dash", "0312345678001", "0312345678-001"],
    ["digits grouped by spaces and dots", "0312 345.678", "0312345678"],
    ["a person's twelve digits", "079203001234", "079203001234"],
  ])("takes a tax code of %s", (_case, typed, stored) => {
    const result = buyerFromForm(company({ taxCode: typed }));
    expect(result).toEqual({
      ok: true,
      buyer: { taxCode: stored, name: "Công ty TNHH Khách Hàng", address: "5 Nguyễn Huệ, Quận 1" },
    });
    // Exactly what the server's contract takes.
    if (result.ok)
      expect(
        setBuyerInfoPayloadSchema.safeParse({
          orderId: "0199f000-0000-7000-8000-00000000c001",
          buyer: result.buyer,
        }).success,
      ).toBe(true);
  });

  it.each([
    ["nine digits", "031234567"],
    ["eleven digits", "03123456780"],
    ["a branch suffix of two digits", "0312345678-01"],
    ["letters", "03123456AB"],
    ["nothing", ""],
  ])("refuses a tax code of %s", (_case, typed) => {
    expect(problemsOf(company({ taxCode: typed }))).toEqual({ taxCode: "tax_code" });
  });

  it("refuses a tax code without the company's name, which the invoice must show", () => {
    expect(problemsOf(company({ name: "   " }))).toEqual({ name: "company_name_missing" });
  });

  it("refuses a name longer than the invoice holds, and a malformed email", () => {
    expect(problemsOf(company({ name: "A".repeat(201) }))).toEqual({ name: "too_long" });
    expect(problemsOf(company({ email: "ketoan@" }))).toEqual({ email: "email" });
    expect(buyerFromForm(company({ email: " ketoan@congty.vn " }))).toMatchObject({
      ok: true,
      buyer: { email: "ketoan@congty.vn" },
    });
  });
});

describe("the buyer a person's invoice names", () => {
  it("takes a citizen id, or a phone, with or without a name", () => {
    expect(buyerFromForm(person({ citizenId: "0792 0300 1234" }))).toEqual({
      ok: true,
      buyer: { citizenId: "079203001234" },
    });
    expect(buyerFromForm(person({ phone: "+84901234567", name: "Lan" }))).toEqual({
      ok: true,
      buyer: { phone: "+84901234567", name: "Lan" },
    });
  });

  it("refuses a person given by neither, and ids of the wrong shape", () => {
    expect(problemsOf(person({ name: "Lan" }))).toEqual({ citizenId: "person_unnamed" });
    expect(problemsOf(person({ citizenId: "07920300123" }))).toEqual({ citizenId: "citizen_id" });
    expect(problemsOf(person({ phone: "901234567" }))).toEqual({ phone: "phone" });
  });

  it("ignores a tax code left from the company form once the cashier switched to a person", () => {
    expect(buyerFromForm(person({ taxCode: "0312345678", phone: "0901234567" }))).toEqual({
      ok: true,
      buyer: { phone: "0901234567" },
    });
  });
});

describe("changing details given earlier", () => {
  it("fills the form of the kind the buyer was", () => {
    expect(formOfBuyer({ taxCode: "0312345678", name: "Cty" })).toMatchObject({
      kind: "company",
      taxCode: "0312345678",
      name: "Cty",
    });
    expect(formOfBuyer({ phone: "0901234567" })).toMatchObject({
      kind: "person",
      phone: "0901234567",
    });
    expect(formOfBuyer(null)).toEqual(EMPTY_BUYER_FORM);
  });
});
