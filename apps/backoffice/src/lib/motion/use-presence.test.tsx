import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi as mock } from "vitest";
import { usePresence } from "./use-presence";

function Layer({ open }: { open: boolean }) {
  const { present, leaving } = usePresence(open, "--t-exit");
  return present ? <div data-testid="layer" data-leaving={leaving ? "" : undefined} /> : null;
}

const layer = () => screen.queryByTestId("layer");

beforeEach(() => {
  mock.useFakeTimers();
  document.documentElement.style.setProperty("--t-exit", "140ms");
});

afterEach(() => {
  cleanup();
  mock.useRealTimers();
  document.documentElement.style.removeProperty("--t-exit");
});

describe("a layer that plays its leaving movement", () => {
  it("is on the page only while open when nothing moves", () => {
    document.documentElement.style.setProperty("--t-exit", "0ms");
    const view = render(<Layer open />);
    expect(layer()).not.toBeNull();
    view.rerender(<Layer open={false} />);
    expect(layer()).toBeNull();
  });

  it("stays marked as leaving for the movement, then goes at the timer with no animation event", () => {
    const view = render(<Layer open />);
    view.rerender(<Layer open={false} />);
    expect(layer()?.hasAttribute("data-leaving")).toBe(true);
    act(() => void mock.advanceTimersByTime(100));
    expect(layer()).not.toBeNull();
    act(() => void mock.advanceTimersByTime(100));
    expect(layer()).toBeNull();
  });

  it("keeps the same element, unmarked and with no timer left, when opened again while leaving", () => {
    const view = render(<Layer open />);
    const first = layer();
    view.rerender(<Layer open={false} />);
    act(() => void mock.advanceTimersByTime(60));
    view.rerender(<Layer open />);
    expect(layer()).toBe(first);
    expect(layer()?.hasAttribute("data-leaving")).toBe(false);
    act(() => void mock.advanceTimersByTime(1000));
    expect(screen.getAllByTestId("layer")).toHaveLength(1);
  });

  it("is not drawn at all while closed from the start", () => {
    render(<Layer open={false} />);
    expect(layer()).toBeNull();
  });
});
