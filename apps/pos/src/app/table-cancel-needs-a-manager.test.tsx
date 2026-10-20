import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { simulatedPrinterThatPrints } from "../features/printing/printer-port";
import { vi as text } from "../messages/vi";
import { managerApproves, pushedOf, tablesWithManager, tap } from "../test-support/approval-cafe";
import { FLOOR, addCoffees, openTable, tillOnTheFloor } from "../test-support/table-cafe-server";

const T = text.adjust;
/** The number the till gives the table's order on this floor. */
const ORDER_NO = 2;

/** One coffee saved at table 1, then the cancel screen confirmed with a reason. */
async function cancelTheTable(server: ReturnType<typeof tablesWithManager>, preBill: boolean) {
  await tillOnTheFloor(server, simulatedPrinterThatPrints);
  await openTable(FLOOR.t1, "1");
  addCoffees(1);
  if (preBill) {
    tap(text.tables.order.preBill);
    await waitFor(() => expect(pushedOf(server, "order.mark_pre_bill_printed")).toHaveLength(1));
    tap(text.tables.slips.backToOrder);
  }
  await waitFor(() => expect(pushedOf(server, "order.save_draft").length).toBeGreaterThan(0));
  tap(T.tools.cancelOrder);
  await screen.findByRole("heading", { name: T.cancel.title(ORDER_NO) });
  tap(text.reasons.customer_left);
  tap(T.cancel.confirm);
}

describe("cancelling a table's order", () => {
  it("asks a manager once the guests were handed a pre-bill, and names the approval", async () => {
    const server = tablesWithManager();
    await cancelTheTable(server, true);
    await screen.findByRole("heading", { name: text.approval.title });
    expect(document.querySelector("[data-approval-for]")?.textContent).toBe(
      text.approval.actions.closeUnpaid(ORDER_NO),
    );
    await managerApproves();
    await waitFor(() => expect(pushedOf(server, "order.cancel")).toHaveLength(1));
    expect(server.state.calls.approvals[0]?.action).toEqual({ key: "close_unpaid_table" });
    expect(pushedOf(server, "order.cancel")[0]?.payload).toMatchObject({
      reasonCode: "customer_left",
      approvalId: server.state.approvals[0]?.approvalId,
    });
  });

  it("records nothing when nobody approves the close of a pre-billed table", async () => {
    const server = tablesWithManager();
    await cancelTheTable(server, true);
    await screen.findByRole("heading", { name: text.approval.title });
    tap(text.approval.cancel);
    await screen.findByRole("heading", { name: T.cancel.title(ORDER_NO) });
    expect(pushedOf(server, "order.cancel")).toEqual([]);
  });

  it("is the cashier's alone while nobody was shown a bill or served", async () => {
    const server = tablesWithManager();
    await cancelTheTable(server, false);
    await waitFor(() => expect(pushedOf(server, "order.cancel")).toHaveLength(1));
    expect(server.state.calls.approvals).toEqual([]);
    expect(pushedOf(server, "order.cancel")[0]?.payload).not.toHaveProperty("approvalId");
  });
});
