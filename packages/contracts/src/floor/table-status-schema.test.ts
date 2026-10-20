import { describe, expect, it } from "vitest";
import { tableStatusOf } from "./table-status-schema";

describe("tableStatusOf", () => {
  it("is free with no draft, occupied with one, waiting to pay once its pre-bill is current", () => {
    expect([
      tableStatusOf(null),
      tableStatusOf({ preBillPrinted: false }),
      tableStatusOf({ preBillPrinted: true }),
    ]).toEqual(["free", "occupied", "awaiting_payment"]);
  });
});
