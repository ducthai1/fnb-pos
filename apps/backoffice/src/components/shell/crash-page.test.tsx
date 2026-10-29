import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { vi as words } from "../../messages/vi";
import { ClientErrorReporting } from "../app/client-error-reporting";
import type { BackofficeReporter } from "../../lib/client-errors/backoffice-reporter";
import { CrashPage } from "./crash-page";

describe("the page that replaces one that failed to draw", () => {
  it("says what happened and that the data is safe, and retries on the button", () => {
    const onRetry = vi.fn();
    render(<CrashPage onRetry={onRetry} />);
    expect(screen.getByRole("heading", { name: words.crash.title })).toBeTruthy();
    expect(screen.getByText(words.crash.hint)).toBeTruthy();
    expect(screen.getByText(words.crash.persists)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: words.crash.retry }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: words.crash.home }).getAttribute("href")).toBe("/");
  });
});

describe("reporting what the page throws outside React", () => {
  it("reports window errors and unhandled rejections, and flushes when back online", () => {
    const reporter: BackofficeReporter = {
      capture: vi.fn(),
      setSignedIn: vi.fn(),
      flush: vi.fn(async () => {}),
    };
    const view = render(<ClientErrorReporting reporter={reporter} />);
    const failure = new Event("error") as ErrorEvent;
    Object.assign(failure, { error: new Error("handler threw") });
    window.dispatchEvent(failure);
    const rejection = new Event("unhandledrejection") as PromiseRejectionEvent;
    Object.assign(rejection, { reason: new Error("no one caught it") });
    window.dispatchEvent(rejection);
    window.dispatchEvent(new Event("online"));
    expect(reporter.capture).toHaveBeenNthCalledWith(1, {
      kind: "error",
      error: expect.objectContaining({ message: "handler threw" }),
    });
    expect(reporter.capture).toHaveBeenNthCalledWith(2, {
      kind: "unhandled_rejection",
      error: expect.objectContaining({ message: "no one caught it" }),
    });
    expect(reporter.flush).toHaveBeenCalledTimes(1);
    view.unmount();
    window.dispatchEvent(new Event("online"));
    expect(reporter.flush).toHaveBeenCalledTimes(1);
  });
});
