import { describe, expect, it } from "vitest";
import { outcomeOf, refusedPathsOf } from "../zod-issue-test-helpers";
import { einvoiceProfileSchema, einvoiceProfileSettingSchema } from "./einvoice-profile-schema";

const PROFILE = {
  enabled: true,
  sellerTaxCode: "0312345678",
  sellerName: "Công ty TNHH Phở Sáng",
  sellerAddress: "12 Lê Lợi, Bến Nghé, Quận 1, TP.HCM",
  templateSymbol: "1C26MAA",
  provider: "vnpt",
  regimeVersion: "nd254-tt91",
};

describe("einvoiceProfileSchema", () => {
  it("takes a cash register profile, refunds left uninvoiced unless the shop says otherwise", () => {
    expect(einvoiceProfileSchema.parse(PROFILE)).toEqual({ ...PROFILE, refundInvoicing: "none" });
    const adjusting = { ...PROFILE, refundInvoicing: "adjustment" };
    expect(einvoiceProfileSchema.parse(adjusting)).toEqual(adjusting);
  });

  it.each([
    ["a VAT invoice from the cash register", "1C26MAA"],
    ["a sales invoice from the cash register", "2C27MXY"],
  ])("takes the template symbol of %s", (_case, templateSymbol) => {
    expect(outcomeOf(einvoiceProfileSchema, { ...PROFILE, templateSymbol }).ok).toBe(true);
  });

  it.each([
    ["without the M of a cash register", "1C26TAA"],
    ["of an invoice without a tax authority code", "1K26MAA"],
    ["of another invoice type", "5C26MAA"],
    ["in lower case", "1c26maa"],
    ["with the year written in full", "1C2026MAA"],
  ])("refuses a template symbol %s", (_case, templateSymbol) => {
    expect(refusedPathsOf(einvoiceProfileSchema, { ...PROFILE, templateSymbol })).toEqual([
      "templateSymbol",
    ]);
  });

  it("refuses a regime this build has no rules for, rather than guessing them", () => {
    expect(
      refusedPathsOf(einvoiceProfileSchema, { ...PROFILE, regimeVersion: "nd70-2025" }),
    ).toEqual(["regimeVersion"]);
  });

  it.each([
    ["ten digits", "0312345678", true],
    ["a branch unit's thirteen", "0312345678-001", true],
    ["a person's twelve-digit citizen id", "079123456789", true],
    ["nine digits", "031234567", false],
    ["a branch suffix of two digits", "0312345678-01", false],
    ["spaces", "0312 345 678", false],
  ])("seller tax code of %s: accepted %s", (_case, sellerTaxCode, accepted) => {
    expect(outcomeOf(einvoiceProfileSchema, { ...PROFILE, sellerTaxCode }).ok).toBe(accepted);
  });

  it.each([
    ["a blank seller name", { sellerName: "   " }],
    ["a missing address", { sellerAddress: undefined }],
    ["a provider key with capitals", { provider: "VNPT" }],
    ["a refund treatment the regime lacks", { refundInvoicing: "cancel" }],
    ["an unknown field", { issueDate: "2026-07-01" }],
  ])("refuses %s", (_case, change) => {
    expect(outcomeOf(einvoiceProfileSchema, { ...PROFILE, ...change }).ok).toBe(false);
  });

  it("is a setting that is unset (null) until the branch or its brand sets it", () => {
    expect(einvoiceProfileSettingSchema.parse(null)).toBeNull();
  });
});
