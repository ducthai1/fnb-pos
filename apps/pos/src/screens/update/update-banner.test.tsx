import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { vi as words } from "../../messages/vi";
import { UpdateBanner, type UpdateBannerProps } from "./update-banner";

const banner = (props: Partial<UpdateBannerProps> = {}) => {
  const onUpdate = vi.fn();
  const view = render(
    <UpdateBanner
      open
      blockedBy={null}
      pendingCommands={0}
      updating={false}
      onUpdate={onUpdate}
      {...props}
    />,
  );
  return { onUpdate, ...view };
};

describe("the update banner", () => {
  it("says the update waits for the shift to close and updates on the button", () => {
    const { onUpdate } = banner();
    expect(screen.getByText(words.update.banner)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: words.update.now }));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("disables the button and says why while commands are unsent", () => {
    const { onUpdate } = banner({ blockedBy: "outbox", pendingCommands: 3 });
    const button = screen.getByRole("button", { name: words.update.now }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(words.update.waitOutbox(3))).toBeTruthy();
    fireEvent.click(button);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("disables the button while a dialog is open", () => {
    banner({ blockedBy: "dialog" });
    expect(screen.getByText(words.update.waitDialog)).toBeTruthy();
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables the button and says so while it updates", () => {
    banner({ updating: true });
    const button = screen.getByRole("button", { name: words.update.updating });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("draws nothing while closed", () => {
    banner({ open: false });
    expect(screen.queryByText(words.update.banner)).toBeNull();
  });
});
