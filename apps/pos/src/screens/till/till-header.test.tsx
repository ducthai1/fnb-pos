import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../../messages/vi";
import { TillBarNav } from "./till-bar-nav";
import { TillHeader, type TillHeaderProps } from "./till-header";
import { TillTools } from "./till-tools";

function header(overrides: Partial<TillHeaderProps> = {}) {
  const pressed: string[] = [];
  render(
    <TillHeader
      branchName="Quận 1"
      brandName="Cà Phê Mây"
      deviceName="Quầy 1"
      staffName="Lan"
      status={{ connection: "online", pending: 0, needsAttention: 0 }}
      onOpenNeedsAttention={() => void pressed.push("attention")}
      onSwitchStaff={() => void pressed.push("switch")}
      onSignOut={() => void pressed.push("sign-out")}
      {...overrides}
    />,
  );
  return pressed;
}

describe("the till's bar", () => {
  it("says where the till is: brand, branch and the till's own name", () => {
    header();
    expect(screen.getByText("Cà Phê Mây")).toBeTruthy();
    expect(screen.getByText(text.shell.placeLine("Quận 1", "Quầy 1"))).toBeTruthy();
  });

  it("shows the branch alone when the till's own name is not known", () => {
    header({ deviceName: undefined });
    expect(screen.getByText("Quận 1")).toBeTruthy();
  });

  it("names who is at the till, read out as a sentence", () => {
    header();
    expect(screen.getByText(text.sales.signedInAs("Lan"))).toBeTruthy();
  });

  it("names the open shift by its business date", () => {
    header({ shiftDate: "2026-10-21" });
    expect(screen.getByText(text.shell.shiftOf("2026-10-21")).textContent).toBe("Ca ngày 21/10");
    expect(screen.queryByText(text.shell.noShift)).toBeNull();
  });

  it("says no shift is open once that is known, and says nothing while it is not", () => {
    header({ shiftDate: null });
    expect(screen.getByText(text.shell.noShift)).toBeTruthy();
    expect(screen.queryByText(/^Ca ngày/)).toBeNull();
  });

  it("leaves the shift out while the till is still reading it", () => {
    header({ shiftDate: undefined });
    expect(screen.queryByText(text.shell.noShift)).toBeNull();
    expect(screen.queryByText(/^Ca ngày/)).toBeNull();
  });

  it("switches staff and signs out from the buttons that say so", () => {
    const pressed = header();
    fireEvent.click(screen.getByRole("button", { name: text.sales.switchStaff }));
    fireEvent.click(screen.getByRole("button", { name: text.session.signOut }));
    expect(pressed).toEqual(["switch", "sign-out"]);
  });

  it("carries the selling screens' tools inside the bar, and only where they are given", () => {
    const bar = (
      <TillHeader
        branchName="Quận 1"
        staffName="Lan"
        status={{ connection: "online", pending: 0, needsAttention: 0 }}
        onOpenNeedsAttention={() => {}}
        onSwitchStaff={() => {}}
        onSignOut={() => {}}
      />
    );
    const { unmount } = render(
      <TillBarNav nav={<TillTools onOpen={() => {}} />}>{bar}</TillBarNav>,
    );
    const tools = screen.getByRole("navigation", { name: text.tools.label });
    expect(screen.getByRole("banner", { name: text.shell.barLabel }).contains(tools)).toBe(true);
    unmount();
    render(bar);
    expect(screen.queryByRole("navigation", { name: text.tools.label })).toBeNull();
  });
});
