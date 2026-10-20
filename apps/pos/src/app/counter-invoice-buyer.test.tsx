import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import { invoiceCafeServer } from "../test-support/invoice-cafe-server";
import { money, pushedOf, tap, twoCoffeesToPayment } from "../test-support/qr-cafe-server";
import { signedInTill } from "../test-support/signed-in-till";

const I = text.invoice;
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("putting the buyer on the e-invoice before paying", () => {
  it("records a company's checked tax code, name and address, then the payment", async () => {
    const server = invoiceCafeServer();
    await signedInTill(server);
    await twoCoffeesToPayment();
    tap(I.offer);
    await screen.findByRole("heading", { name: I.title });
    type(I.fields.taxCode, "031234567");
    type(I.fields.name, "Công ty TNHH Khách Hàng");
    type(I.fields.address, "5 Nguyễn Huệ, Quận 1");
    tap(I.save);
    // Nine digits: the cashier is told which field, and nothing is recorded.
    expect(screen.getByText(I.problems.tax_code)).toBeTruthy();
    expect(screen.getByLabelText(I.fields.taxCode).getAttribute("aria-invalid")).toBe("true");
    type(I.fields.taxCode, "0312345678001");
    tap(I.save);
    await screen.findByRole("heading", { name: text.checkout.payment.title });
    expect(
      screen.getByText(I.forCompany("Công ty TNHH Khách Hàng", "0312345678-001")),
    ).toBeTruthy();
    tap(text.checkout.payment.quickCash(money(100_000)));
    tap(text.checkout.payment.finish);
    await screen.findByRole("heading", { name: text.checkout.done.title });
    await waitFor(() => expect(pushedOf(server, "order.pay")).toHaveLength(1));
    const set = pushedOf(server, "order.set_buyer_info");
    expect(set.map((command) => command.payload)).toEqual([
      {
        orderId: pushedOf(server, "order.pay")[0]?.payload.orderId,
        buyer: {
          taxCode: "0312345678-001",
          name: "Công ty TNHH Khách Hàng",
          address: "5 Nguyễn Huệ, Quận 1",
        },
      },
    ]);
    const types = server.state.pushed.map((command) => command.type);
    expect(types.indexOf("order.set_buyer_info")).toBeLessThan(types.indexOf("order.pay"));
    expect(types.indexOf("order.set_buyer_info")).toBeGreaterThan(
      types.indexOf("order.save_draft"),
    );
  });

  it("records a person by phone, and takes the details back for a retail customer", async () => {
    const server = invoiceCafeServer();
    await signedInTill(server);
    await twoCoffeesToPayment();
    tap(I.offer);
    tap(I.kinds.person);
    tap(I.save);
    expect(screen.getByText(I.problems.person_unnamed)).toBeTruthy();
    type(I.fields.phone, "0901 234 567");
    tap(I.save);
    await screen.findByText(I.forPerson("0901234567"));
    tap(I.edit);
    tap(I.clear);
    await screen.findByText(I.retail);
    await waitFor(() => expect(pushedOf(server, "order.set_buyer_info")).toHaveLength(2));
    expect(pushedOf(server, "order.set_buyer_info").map((c) => c.payload.buyer)).toEqual([
      { phone: "0901234567" },
      null,
    ]);
  });

  it("offers no invoice details on a branch that issues no e-invoices", async () => {
    const server = invoiceCafeServer(false);
    await signedInTill(server);
    await twoCoffeesToPayment();
    expect(screen.queryByRole("button", { name: I.offer })).toBeNull();
    expect(screen.queryByText(I.retail)).toBeNull();
  });
});
