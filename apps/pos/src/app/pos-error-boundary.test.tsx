import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ClientErrorReporter } from "../features/client-errors/client-error-reporter";
import { vi as words } from "../messages/vi";
import { PosErrorBoundary } from "./pos-error-boundary";

function Broken(): never {
  throw new Error("cannot draw the cart");
}

const fakeReporter = () => ({
  capture: vi.fn(),
  authenticate: vi.fn(),
  flush: vi.fn(async () => {}),
});

describe("when a screen of the till fails to draw", () => {
  it("shows the recovery screen, says the sales data is kept, and reloads on the button", () => {
    const reporter = fakeReporter();
    const onReload = vi.fn();
    silenceReactErrors(() => {
      render(
        <PosErrorBoundary reporter={reporter as ClientErrorReporter} onReload={onReload}>
          <Broken />
        </PosErrorBoundary>,
      );
    });
    expect(screen.getByRole("heading", { name: words.crash.title })).toBeTruthy();
    expect(screen.getByText(words.crash.safeHint)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: words.crash.reload }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("reports the failure as a render fault with the component stack", () => {
    const reporter = fakeReporter();
    silenceReactErrors(() => {
      render(
        <PosErrorBoundary reporter={reporter as ClientErrorReporter} onReload={() => {}}>
          <Broken />
        </PosErrorBoundary>,
      );
    });
    expect(reporter.capture).toHaveBeenCalledTimes(1);
    expect(reporter.capture.mock.calls[0]?.[0]).toMatchObject({
      kind: "render",
      error: { message: "cannot draw the cart" },
      extraStack: expect.stringContaining("Broken"),
    });
  });

  it("shows the children while nothing fails", () => {
    render(
      <PosErrorBoundary onReload={() => {}}>
        <p>till</p>
      </PosErrorBoundary>,
    );
    expect(screen.getByText("till")).toBeTruthy();
  });
});

/** React logs a caught render error to the console; keep that out of the test output. */
function silenceReactErrors(run: () => void) {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    run();
  } finally {
    spy.mockRestore();
  }
}
