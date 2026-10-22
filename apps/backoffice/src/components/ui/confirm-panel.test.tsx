import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi as mock } from "vitest";
import { vi } from "../../messages/vi";
import { ConfirmPanel } from "./confirm-panel";

const D = vi.devices;

function revoke(busy: boolean, error: string | null = null) {
  const onConfirm = mock.fn();
  const onCancel = mock.fn();
  render(
    <ConfirmPanel
      title={D.revokeTitle("Máy bán hàng")}
      hint={D.revokeHint}
      confirmLabel={D.revokeConfirm}
      busyLabel={D.revoking}
      busy={busy}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onConfirm, onCancel };
}

afterEach(cleanup);

describe("the one confirm of everything that cannot be undone", () => {
  it("names itself by its question and offers a solid red button that can be pressed", () => {
    const { onConfirm, onCancel } = revoke(false);
    const dialog = screen.getByRole("alertdialog", { name: D.revokeTitle("Máy bán hàng") });
    expect(dialog.getAttribute("aria-describedby")).not.toBeNull();
    const act = screen.getByRole("button", { name: D.revokeConfirm });
    expect((act as HTMLButtonElement).disabled).toBe(false);
    expect(act.classList.contains("bo-button--destructive")).toBe(true);
    expect(act.getAttribute("aria-busy")).toBeNull();
    fireEvent.click(act);
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: vi.common.cancel }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("says it is working, and takes no second press, only while it really is busy", () => {
    const { onConfirm } = revoke(true);
    const act = screen.getByRole("button", { name: D.revoking });
    expect((act as HTMLButtonElement).disabled).toBe(true);
    expect(act.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(act);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows why the step failed inside itself", () => {
    revoke(false, "Mất mạng, thử lại.");
    expect(screen.getByRole("alertdialog").textContent).toContain("Mất mạng, thử lại.");
  });

  it("does not draw a change that can be undone in red", () => {
    render(
      <ConfirmPanel
        title="Sửa nhân viên"
        confirmLabel="Lưu"
        busyLabel="Đang lưu…"
        busy={false}
        error={null}
        tone="change"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(screen.getByRole("alertdialog", { name: "Sửa nhân viên" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lưu" }).classList.contains("bo-button--primary")).toBe(true);
  });
});
