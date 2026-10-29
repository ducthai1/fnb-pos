import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi as mock } from "vitest";
import { vi as text } from "../../messages/vi";
import { BlockedScreen } from "../blocked/blocked-screen";
import { CrashScreen } from "./crash-screen";

describe("the fault screens", () => {
  it("tell the cashier the data is safe and reload from the one button", () => {
    const onReload = mock.fn();
    render(<CrashScreen onReload={onReload} />);
    expect(screen.getByRole("heading", { name: text.crash.title }).closest(".pos-gate")).not.toBeNull();
    expect(screen.getByRole("note").textContent).toContain(text.crash.safeTitle);
    fireEvent.click(screen.getByRole("button", { name: text.crash.reload }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["another_tab", text.boot.openInAnotherTab, text.boot.openInAnotherTabHint],
    ["unsupported", text.boot.unsupported, text.boot.unsupportedHint],
    ["failed", text.boot.failed, text.boot.failedHint],
  ] as const)("say why the till is blocked (%s) and offer a reload", (reason, title, hint) => {
    const onReload = mock.fn();
    render(<BlockedScreen reason={reason} onReload={onReload} />);
    expect(screen.getByRole("heading", { name: title }).closest(".pos-gate")).not.toBeNull();
    expect(screen.getByText(hint)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: text.boot.reload }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
