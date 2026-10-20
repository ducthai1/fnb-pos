import { posAvailabilitySchema } from "@fnb/contracts";
import { describe, expect, it } from "vitest";
import { isSoldOut } from "./product-availability";

const NOW = Date.UTC(2026, 9, 20, 7, 0);
const at = (ms: number) => new Date(ms).toISOString();
const availability = (entries: { channelKey: string | null; unavailableUntil: string | null }[]) =>
  posAvailabilitySchema.parse({
    productId: "0199f000-0000-7000-8000-000000000001",
    version: 1,
    entries,
  });

describe("whether the counter may sell a product", () => {
  it("sells a product with no sold-out entry, or whose list was emptied", () => {
    expect(isSoldOut(undefined, null, NOW)).toBe(false);
    expect(isSoldOut(availability([]), null, NOW)).toBe(false);
  });

  it("refuses a product sold out on every channel until someone puts it back", () => {
    expect(isSoldOut(availability([{ channelKey: null, unavailableUntil: null }]), null, NOW)).toBe(
      true,
    );
  });

  it("refuses it until its end and sells it again once the till's clock passes the end", () => {
    const until = availability([{ channelKey: null, unavailableUntil: at(NOW + 60_000) }]);
    expect(isSoldOut(until, null, NOW)).toBe(true);
    expect(isSoldOut(until, null, NOW + 60_000)).toBe(false);
    expect(isSoldOut(until, null, NOW + 60_001)).toBe(false);
  });

  it("sells at the counter what is sold out on a delivery channel only", () => {
    const grabOnly = availability([{ channelKey: "grab", unavailableUntil: null }]);
    expect(isSoldOut(grabOnly, null, NOW)).toBe(false);
    expect(isSoldOut(grabOnly, "grab", NOW)).toBe(true);
  });
});
