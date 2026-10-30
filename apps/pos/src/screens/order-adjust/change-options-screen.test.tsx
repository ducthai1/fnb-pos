import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi as spy } from "vitest";
import { vi } from "../../messages/vi";
import { HOSTILE_MENU_NAMES } from "../../test-support/hostile-menu";
import { ChangeOptionsScreen } from "./change-options-screen";

const T = vi.adjust.change;
const props = (failure: string | null) => ({
  header: null,
  itemName: HOSTILE_MENU_NAMES.product,
  failure,
  closing: false,
  onRetry: spy.fn(),
  onBack: spy.fn(),
});

describe("the screen of a change of options", () => {
  it("shows the item while the old one is cancelled", () => {
    render(<ChangeOptionsScreen {...props(null)} />);
    expect(screen.getByRole("heading", { name: T.title })).toBeTruthy();
    expect(screen.getByText(HOSTILE_MENU_NAMES.product)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says the order is as it was when the cancel was refused, and offers retry and back", () => {
    const sentence = `Không hủy được món ${HOSTILE_MENU_NAMES.product}`;
    const shown = props(sentence);
    render(<ChangeOptionsScreen {...shown} />);
    expect(screen.getByRole("alert").textContent).toBe(sentence);
    expect(screen.getByText(T.unchanged)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: T.retry }));
    fireEvent.click(screen.getByRole("button", { name: vi.adjust.back }));
    expect(shown.onRetry).toHaveBeenCalledOnce();
    expect(shown.onBack).toHaveBeenCalledOnce();
  });
});
