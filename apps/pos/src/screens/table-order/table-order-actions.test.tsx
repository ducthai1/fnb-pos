import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { vi as text } from "../../messages/vi";
import { TableOrderActions, type TableOrderActionsProps } from "./table-order-actions";

const K = text.sale.keys;

type State = Pick<TableOrderActionsProps, "owedUnits" | "billable" | "saved" | "blocked">;

function actions(state: Partial<State>) {
  const on = {
    onSend: vi.fn(),
    onPreBill: vi.fn(),
    onPay: vi.fn(),
    onTransfer: vi.fn(),
    onBack: vi.fn(),
  };
  render(<TableOrderActions owedUnits={2} billable saved blocked={false} {...state} {...on} />);
  return on;
}
const press = (key: string) => fireEvent.keyDown(window, { key });

afterEach(() => {
  document.body.innerHTML = "";
});

describe("a table's order on the till's keyboard", () => {
  it("sends the round, prints the pre-bill and pays by key", () => {
    const on = actions({});
    press(K.send);
    press(K.preBill);
    press(K.pay);
    expect([on.onSend, on.onPreBill, on.onPay].map((fn) => fn.mock.calls.length)).toEqual([
      1, 1, 1,
    ]);
  });

  it("does nothing by key that the buttons would refuse", () => {
    const nothingOwed = actions({ owedUnits: 0, billable: false });
    press(K.send);
    press(K.preBill);
    press(K.pay);
    expect(nothingOwed.onSend).not.toHaveBeenCalled();
    expect(nothingOwed.onPreBill).not.toHaveBeenCalled();
    expect(nothingOwed.onPay).not.toHaveBeenCalled();
    document.body.innerHTML = "";
    const refused = actions({ blocked: true });
    press(K.send);
    press(K.pay);
    expect(refused.onSend).not.toHaveBeenCalled();
    expect(refused.onPay).not.toHaveBeenCalled();
  });
});
