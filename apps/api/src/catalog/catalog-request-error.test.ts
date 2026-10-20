import { describe, expect, it } from "vitest";
import { safeDomainDetails } from "./catalog-request-error";

describe("safeDomainDetails", () => {
  it("keeps the ids that say where a refusal belongs", () => {
    const details = { groupId: "g", optionId: "o", variantId: "v", slotId: "s" };
    expect(safeDomainDetails(details)).toEqual(details);
    expect(safeDomainDetails({ productId: "p", priceListItemId: "i" })).toEqual({
      productId: "p",
      priceListItemId: "i",
    });
  });

  it("drops amounts, limits and anything not named, so nothing else leaves the server", () => {
    const details = { groupId: "g", priceDelta: -1_000n, maxQuantity: 3, enteredPrice: 5n };
    expect(safeDomainDetails(details)).toEqual({ groupId: "g" });
    expect(safeDomainDetails({ reachable: 2, sql: "SELECT" })).toBeNull();
  });

  it("drops an id key whose value is not text, and answers null without details", () => {
    expect(safeDomainDetails({ groupId: 7, optionId: null })).toBeNull();
    expect(safeDomainDetails(undefined)).toBeNull();
    const inherited = Object.create({ groupId: "from-prototype" }) as Record<string, unknown>;
    expect(safeDomainDetails(inherited)).toBeNull();
  });
});
