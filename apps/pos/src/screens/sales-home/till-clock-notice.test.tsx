import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VI_TILL_CLOCK } from "../../messages/vi-shift-tools";
import { TillClockNotice } from "./till-clock-notice";

const MINUTE = 60_000;

describe("the notice of a till clock that is off", () => {
  it.each([
    ["three minutes fast", -3 * MINUTE],
    ["three minutes slow", 3 * MINUTE],
  ])("says by how much and that the till uses the server's clock, %s", (_label, offsetMs) => {
    render(<TillClockNotice offsetMs={offsetMs} />);
    const notice = screen.getByRole("status");
    expect(notice.textContent).toBe(VI_TILL_CLOCK.off(3));
    expect(notice.textContent).toBe(
      "Giờ máy lệch 3 phút — máy đang dùng giờ máy chủ. Nên chỉnh lại giờ Windows.",
    );
    expect(notice.dataset.tone).toBe("warn");
  });

  it.each([
    ["thirty seconds off", -30_000],
    ["exactly at the limit", 2 * MINUTE],
    ["no clock heard yet", null],
  ])("shows nothing %s", (_label, offsetMs) => {
    const { container } = render(<TillClockNotice offsetMs={offsetMs} />);
    expect(container.textContent).toBe("");
  });
});
