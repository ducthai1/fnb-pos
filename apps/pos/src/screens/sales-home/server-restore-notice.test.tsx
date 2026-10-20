import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VI_SERVER_RESTORE } from "../../messages/vi-server-restore";
import { ServerRestoreNotice } from "./server-restore-notice";

describe("the notice of a restored server", () => {
  it("says how many of the till's commands it is sending again", () => {
    render(<ServerRestoreNotice restore={{ resending: 3, unrecoverable: 0 }} />);
    expect(screen.getByRole("status").textContent).toBe(VI_SERVER_RESTORE.resending(3));
  });

  it("warns, and keeps warning, when the till no longer holds some of what was lost", () => {
    render(<ServerRestoreNotice restore={{ resending: 2, unrecoverable: 4 }} />);
    expect(screen.getByRole("alert").textContent).toBe(VI_SERVER_RESTORE.unrecoverable(4));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it.each([
    ["nothing left to send", { resending: 0, unrecoverable: 0 }],
    ["no restore known yet", undefined],
  ])("shows nothing with %s", (_label, restore) => {
    const { container } = render(<ServerRestoreNotice restore={restore} />);
    expect(container.textContent).toBe("");
  });
});
