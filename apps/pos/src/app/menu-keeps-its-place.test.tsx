import { formatVnd, vnd } from "@fnb/domain";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import { cafeServer, signedInTill } from "../test-support/signed-in-till";

const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const tab = (name: string) => screen.getByRole("tab", { name: new RegExp(`^${name}`) });
const search = () => screen.getByRole("searchbox", { name: text.sale.search }) as HTMLInputElement;

/** On the drinks, a search typed, one milk coffee on the order. */
async function drinksSearchedAndOneCoffee() {
  fireEvent.click(tab("Đồ uống"));
  fireEvent.change(search(), { target: { value: "sữa" } });
  tap(/^Cà phê sữa/);
  tap(text.sale.more("Cà phê sữa"));
  tap(/^Thêm vào đơn/);
  await screen.findByText(text.sale.orderNumber(1));
}

describe("the menu keeps the cashier's place", () => {
  it("is where it was after a look at the day's orders, on the same order", async () => {
    await signedInTill(cafeServer());
    await drinksSearchedAndOneCoffee();
    tap(text.history.open);
    await screen.findByRole("heading", { name: text.history.title });
    tap(text.history.back);
    await screen.findByText(text.sale.orderNumber(1));
    expect(tab("Đồ uống").getAttribute("aria-selected")).toBe("true");
    expect(search().value).toBe("sữa");
  });

  it("keeps the category for the next customer, with the search cleared", async () => {
    await signedInTill(cafeServer());
    await drinksSearchedAndOneCoffee();
    tap(text.sale.checkout);
    await screen.findByRole("dialog", { name: text.checkout.payment.title });
    tap(text.checkout.payment.quickCash(formatVnd(vnd(100_000))));
    tap(text.checkout.payment.finish);
    await screen.findByRole("heading", { name: text.checkout.done.title });
    tap(text.checkout.done.nextOrder);
    await screen.findByText(text.sale.orderNumber(2));
    expect(tab("Đồ uống").getAttribute("aria-selected")).toBe("true");
    expect(search().value).toBe("");
  });

  it("starts on every category on a till just signed in", async () => {
    await signedInTill(cafeServer());
    expect(tab(text.sale.allCategories).getAttribute("aria-selected")).toBe("true");
  });
});
