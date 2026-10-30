import { newId } from "@fnb/db";
import { vi as text } from "@fnb/pos/messages/vi";
import type { Browser, Page } from "playwright-core";
import type { PosStack } from "../../support/global-setup-start-pos-stack";
import { backoffice, putProduct } from "./backoffice-calls";
import type pg from "pg";
import { abandonDraftsAt, floorOf } from "./table-records";
import { openShift, pairedTillWithCashier } from "./till-in-browser";

export const COFFEE = "Cà phê đen bàn";
export const TEA = "Trà đào bàn";

/**
 * The stack's branch serving at tables: a bar, a coffee (25.000) and a tea (40.000) made
 * there, one area of tables E1–E3. `close` clears the drafts the spec left at the tables and
 * sends the branch back to the counter only, as it is shared with the other specs.
 */
export function tableServiceShop(stack: PosStack) {
  const tablesSetting = `/settings/branch/${stack.branchId}/tables`;
  const ids = {
    bar: newId(),
    coffee: newId(),
    tea: newId(),
    area: newId(),
    tables: [newId(), newId(), newId()],
  };
  const tile = (page: Page, index: number) => page.locator(`[data-table="${ids.tables[index]}"]`);

  async function setUp() {
    await backoffice(stack, "PUT", tablesSetting, { value: true }, 200);
    const station = { version: null, branchId: stack.branchId, name: "Bar phục vụ bàn" };
    await backoffice(stack, "PUT", `/catalog/stations/${ids.bar}`, station, 201);
    const drink = {
      kind: "prepared_drink",
      pricingMode: "fixed",
      taxRateBp: 800,
      stationId: ids.bar,
    };
    await putProduct(stack, ids.coffee, { ...drink, name: COFFEE, basePrice: 25_000 }, null);
    await putProduct(stack, ids.tea, { ...drink, name: TEA, basePrice: 40_000 }, null);
    await floorOf(stack, ids, "Tầng trệt phục vụ bàn", ["E1", "E2", "E3"]);
  }

  /** A till of the branch on its floor, its shift opened on an empty drawer. */
  async function tillOnTheFloor(browser: Browser, cashier: string) {
    const till = await pairedTillWithCashier(browser, stack, cashier);
    await openShift(till.page, []);
    await till.page.getByRole("button", { name: text.tables.modes.tables, exact: true }).click();
    await tile(till.page, 0).waitFor();
    return till;
  }

  return {
    ids,
    tile,
    statusOf: (page: Page, index: number) => tile(page, index).getAttribute("data-table-status"),
    setUp,
    tillOnTheFloor,
    close: async (pool: pg.Pool) => {
      await abandonDraftsAt(pool, stack.tenantId, ids.tables);
      await backoffice(stack, "DELETE", tablesSetting, {}, 200);
    },
  };
}
