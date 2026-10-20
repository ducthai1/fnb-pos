import { describe, expect, it } from "vitest";
import { outcomeOf, refusedPathsOf } from "../zod-issue-test-helpers";
import { einvoiceBuyerSchema } from "./einvoice-buyer-schema";

describe("einvoiceBuyerSchema", () => {
  it.each([
    ["a company by tax code and name", { taxCode: "0109876543", name: "Công ty CP Sáng Tạo" }],
    ["a person by citizen id", { citizenId: "079123456789" }],
    ["a person by phone", { phone: "0901234567" }],
    ["a person by an international phone", { phone: "+84901234567" }],
    ["a person by name alone", { name: "Nguyễn Thị Lan" }],
  ])("takes %s", (_case, buyer) => {
    expect(einvoiceBuyerSchema.parse(buyer)).toEqual(buyer);
  });

  it("refuses a tax code without the organization's name", () => {
    expect(refusedPathsOf(einvoiceBuyerSchema, { taxCode: "0109876543" })).toEqual(["name"]);
  });

  it("refuses details that name nobody", () => {
    expect(outcomeOf(einvoiceBuyerSchema, { address: "12 Lê Lợi" }).ok).toBe(false);
    expect(outcomeOf(einvoiceBuyerSchema, {}).ok).toBe(false);
  });

  it.each([
    ["a citizen id of nine digits (the old ID card)", { citizenId: "079123456" }],
    ["a phone with spaces", { phone: "090 123 4567" }],
    ["a blank name", { name: " ", phone: "0901234567" }],
    ["a name past 200 characters", { name: "Ạ".repeat(201) }],
    ["a malformed email", { name: "Lan", email: "lan@" }],
    ["a field the invoice has no place for", { name: "Lan", birthday: "2000-01-01" }],
  ])("refuses %s", (_case, buyer) => {
    expect(outcomeOf(einvoiceBuyerSchema, buyer).ok).toBe(false);
  });
});
