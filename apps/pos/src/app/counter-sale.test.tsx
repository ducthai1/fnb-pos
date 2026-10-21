import { formatVnd, vnd } from "@fnb/domain";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import { cafeServer, signedInTill } from "../test-support/signed-in-till";
import { MENU } from "../test-support/till-fixtures";

const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const drafts = (server: ReturnType<typeof cafeServer>) =>
  server.state.pushed.filter((command) => command.type === "order.save_draft");
const cart = () => within(screen.getByRole("region", { name: text.sale.cartLabel }));
/** The amount due the cart shows, read off the element that shows it. */
const amountDueShown = () =>
  screen.getByRole("region", { name: text.sale.cartLabel }).querySelector("[data-amount-due]")
    ?.textContent;

describe("ringing up at the counter", () => {
  it("opens the shift first, then saves every change of the cart as a draft of intent", async () => {
    const server = cafeServer();
    await signedInTill(server);
    const opened = server.state.pushed.find((command) => command.type === "shift.open");
    expect(opened?.payload).toMatchObject({ openingCash: 0, denominations: [] });
    expect(screen.getByText(text.sale.orderNumber(1))).toBeTruthy();

    tap(/^Trà sữa trân châu/);
    tap("L");
    tap("100% đường");
    tap(/^Trân châu đen/);
    tap(text.sale.more("Trà sữa trân châu"));
    tap(/^Thêm vào đơn/);
    tap(/^Cà phê sữa/);
    tap(/^Thêm vào đơn/);

    // 2 × (45.000 + 5.000) + 29.000: the cart shows the domain's amount, nothing it added.
    await waitFor(() => expect(amountDueShown()).toBe(formatVnd(vnd(129_000))));
    expect(cart().getByText("+ Trân châu đen")).toBeTruthy();
    await waitFor(() => expect(drafts(server)).toHaveLength(2));
    const last = drafts(server).at(-1)?.payload;
    expect(last).toMatchObject({
      deviceOrderNo: 1,
      serviceType: "takeaway",
      tableTag: null,
      channelKey: null,
    });
    expect((last as { lines: unknown[] }).lines).toEqual([
      expect.objectContaining({
        productId: MENU.milkTea,
        variantId: MENU.sizeL,
        quantity: "2",
        modifiers: [
          { groupId: MENU.sugar, optionId: MENU.sugarFull, quantity: 1 },
          { groupId: MENU.toppings, optionId: MENU.pearl, quantity: 1 },
        ],
      }),
      expect.objectContaining({
        productId: MENU.coffee,
        variantId: null,
        quantity: "1",
        modifiers: [],
      }),
    ]);
  });

  it("changes a quantity, removes a line and seats the order at a table, saving each", async () => {
    const server = cafeServer();
    await signedInTill(server);
    tap(/^Cà phê sữa/);
    tap(/^Thêm vào đơn/);
    tap(text.sale.more("Cà phê sữa"));
    await waitFor(() => expect(amountDueShown()).toBe(formatVnd(vnd(58_000))));
    tap(text.sale.dineIn);
    fireEvent.blur(screen.getByLabelText(text.sale.tableTag), { target: { value: " 12 " } });
    await waitFor(() =>
      expect(drafts(server).at(-1)?.payload).toMatchObject({
        serviceType: "dine_in",
        tableTag: "12",
      }),
    );
    // Taking a line off is behind its "…", with its other actions.
    tap(text.adjust.tools.lineMenu("Cà phê sữa"));
    tap(text.sale.remove("Cà phê sữa"));
    await waitFor(() => expect(drafts(server).at(-1)?.payload).toMatchObject({ lines: [] }));
    expect(screen.getByText(text.sale.cartEmpty)).toBeTruthy();
    expect(screen.getByRole("button", { name: text.sale.checkout })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("saves nothing for an order that never had a line", async () => {
    const server = cafeServer();
    await signedInTill(server);
    tap(text.sale.dineIn);
    tap(text.sale.takeaway);
    await waitFor(() => expect(server.state.calls.pulls).toBeGreaterThan(2));
    expect(drafts(server)).toEqual([]);
  });
});
