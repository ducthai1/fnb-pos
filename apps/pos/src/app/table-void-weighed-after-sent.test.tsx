import { formatGrams } from "@fnb/domain";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import { amountDue, managerApproves, pushedOf, tap } from "../test-support/approval-cafe";
import { FLOOR, openTable, tillOnTheFloor } from "../test-support/table-cafe-server";
import { BEANS, weighedCafeWithTables } from "../test-support/typed-and-weighed-menu";

const T = text.adjust;
const E = text.sale.entry;
/** The screen normalizes the no-break space of "351 g"; the query does not. */
const plain = (words: string) => words.replace(/\s/g, " ");

function key(digits: string) {
  const keypad = within(screen.getByRole("group", { name: text.checkout.payment.keypad }));
  for (const digit of digits) fireEvent.click(keypad.getByRole("button", { name: digit }));
}

/** 351 g of beans at table 1, sent to the bar, back on the order. */
async function beansAtTheBar(server: ReturnType<typeof weighedCafeWithTables>) {
  await tillOnTheFloor(server);
  await openTable(FLOOR.t1, "1");
  tap(new RegExp(`^${BEANS.name}`));
  await screen.findByRole("dialog", { name: E.weightTitle(BEANS.name) });
  key("351");
  fireEvent.click(document.querySelector<HTMLButtonElement>("[form='pos-line-entry']")!);
  await waitFor(() => expect(amountDue()).toBe("112320"));
  tap(/^Gửi bếp/);
  await screen.findByRole("heading", { name: text.tables.slips.kitchenTitle });
  await waitFor(() => expect(pushedOf(server, "order.mark_sent_to_kitchen")).toHaveLength(1));
  tap(text.tables.slips.backToOrder);
}

describe("cancelling a weighing the kitchen already has", () => {
  it("cancels the whole weighing with a manager's approval and prints the cancel ticket in grams", async () => {
    const server = weighedCafeWithTables();
    await beansAtTheBar(server);
    tap(T.tools.lineMenu(BEANS.name));
    tap(T.tools.void(BEANS.name));
    await screen.findByRole("heading", { name: T.void.title });
    expect(screen.getByText(plain(T.void.sentWeighed(formatGrams(351))))).toBeTruthy();
    // One weighing: nothing to count.
    expect(screen.queryByRole("button", { name: text.sale.more(BEANS.name) })).toBeNull();
    tap(text.reasons.made_wrong);
    tap(/^Hủy lần cân/);
    expect(
      await screen.findByText(
        plain(text.approval.actions.voidWeighedAfterSent(formatGrams(351), BEANS.name)),
      ),
    ).toBeTruthy();
    await managerApproves();
    await screen.findByRole("heading", { name: T.void.cancelTicketTitle });
    expect(pushedOf(server, "order.void_line")[0]?.payload).toMatchObject({
      quantity: "3.51",
      approvalId: server.state.approvals[0]?.approvalId,
    });
    const ticket = [...document.querySelectorAll('[data-slip-kind="kitchen"] pre')][0]?.textContent;
    expect(ticket).toContain("HỦY");
    expect(ticket).toMatch(/HỦY 351\sg/);
    tap(text.tables.slips.backToOrder);
    await waitFor(() => expect(amountDue()).toBe("0"));
  });
});
