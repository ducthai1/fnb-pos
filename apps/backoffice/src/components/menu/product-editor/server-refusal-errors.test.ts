import { describe, expect, it } from "vitest";
import { messageForCode } from "../../../lib/errors/failure-message";
import { refused } from "../../../test-support/fake-backoffice-api";
import { groupPath, optionPath, productPath, variantPath } from "./draft-error-paths";
import { serverRefusalErrors } from "./server-refusal-errors";

const failure = (code: string, details?: unknown) => ({
  ok: false as const,
  status: 400,
  code,
  body: details === undefined ? { code } : { code, details },
});

describe("serverRefusalErrors", () => {
  it("puts a domain refusal on the part its ids name", () => {
    const code = "DOMAIN_CATALOG_DUPLICATE_OPTION_ID";
    expect(serverRefusalErrors(failure(code, { groupId: "g", optionId: "o" }))).toEqual({
      [optionPath("g", "o")]: messageForCode(code),
    });
    const limits = "DOMAIN_CATALOG_MIN_SELECT_ABOVE_MAX_SELECT";
    expect(serverRefusalErrors(failure(limits, { groupId: "g" }))).toEqual({ [groupPath("g")]: messageForCode(limits) });
    const price = "DOMAIN_PRICING_MISSING_BASE_PRICE";
    expect(serverRefusalErrors(failure(price, { variantId: "v" }))).toEqual({ [variantPath("v", "price")]: messageForCode(price) });
  });

  it("leaves a refusal about the whole product, or naming nothing readable, to the save bar", () => {
    const code = "DOMAIN_MONEY_INVALID_RATE";
    expect(serverRefusalErrors(failure(code))).toBeNull();
    expect(serverRefusalErrors(failure(code, { groupId: 7, optionId: null }))).toBeNull();
    const price = "DOMAIN_PRICING_MISSING_BASE_PRICE";
    expect(serverRefusalErrors(failure(price, { productId: "p" }))).toEqual({
      [productPath("basePrice")]: messageForCode(price),
    });
  });

  it("leaves every other failure to the save bar alone", () => {
    expect(serverRefusalErrors(failure("API_INVALID_REQUEST"))).toBeNull();
    expect(serverRefusalErrors(refused(403, "API_PERMISSION_DENIED"))).toBeNull();
    expect(serverRefusalErrors(refused(null))).toBeNull();
  });
});
