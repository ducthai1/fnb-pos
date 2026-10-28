import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ChosenReason } from "../../features/order-adjust/reason-codes";
import { vi as text } from "../../messages/vi";
import { CancelOrderScreen } from "./cancel-order-screen";
import { VoidLineScreen } from "./void-line-screen";

const A = text.adjust;
const tap = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const note = () => screen.queryByRole("textbox", { name: A.reasonNote });
const write = (said: string) => fireEvent.change(note()!, { target: { value: said } });

/** Each screen with a reason list, its confirm button, and what it confirmed with. */
function shown(kind: "cancel" | "void") {
  const confirmed: ChosenReason[] = [];
  const onConfirm = (reason: ChosenReason) => {
    confirmed.push(reason);
    return Promise.resolve(null);
  };
  if (kind === "cancel") {
    render(<CancelOrderScreen header={null} orderNo={7} onConfirm={onConfirm} onBack={() => {}} />);
    return { confirmed, confirm: A.cancel.confirm };
  }
  render(
    <VoidLineScreen
      header={null}
      itemName="Bạc xỉu"
      remaining={2}
      sentUnits={0}
      onConfirm={(_units, reason) => onConfirm(reason)}
      onBack={() => {}}
    />,
  );
  return { confirmed, confirm: A.void.confirm(1) };
}

describe.each(["cancel", "void"] as const)("the %s screen's reason 'Lý do khác'", (kind) => {
  it("asks for a note, and the confirm button waits for one that says something", () => {
    const { confirm } = shown(kind);
    expect(note()).toBeNull();
    tap(text.reasons.other);
    expect(note()).toBeTruthy();
    expect(screen.getByText(A.reasonNoteRequired)).toBeTruthy();
    expect(screen.getByRole("button", { name: confirm })).toHaveProperty("disabled", true);
    write("    ");
    expect(screen.getByRole("button", { name: confirm })).toHaveProperty("disabled", true);
    write("Khách làm đổ ly");
    expect(screen.getByRole("button", { name: confirm })).toHaveProperty("disabled", false);
    expect(screen.getByText(A.reasonNoteCount(15, 120))).toBeTruthy();
  });

  it("confirms with the note trimmed, and holds at most 120 characters", async () => {
    const { confirmed, confirm } = shown(kind);
    tap(text.reasons.other);
    expect(note()?.getAttribute("maxlength")).toBe("120");
    write("  Khách gọi nhầm quán \n");
    tap(confirm);
    await screen.findByRole("button", { name: confirm });
    expect(confirmed).toEqual([{ code: "other", note: "Khách gọi nhầm quán" }]);
  });

  it("needs no note for a reason of the list, and sends none", async () => {
    const { confirmed, confirm } = shown(kind);
    tap(text.reasons.other);
    write("viết rồi đổi ý");
    const listed = kind === "cancel" ? text.reasons.customer_left : text.reasons.wrong_item;
    tap(listed);
    expect(note()).toBeNull();
    tap(confirm);
    await screen.findByRole("button", { name: confirm });
    expect(confirmed).toEqual([
      { code: kind === "cancel" ? "customer_left" : "wrong_item", note: null },
    ]);
  });
});
