import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TillShiftState } from "../features/shift/use-till-shift";
import { AUTO_APPLY_IDLE_MS } from "../features/updates/update-policy";
import type { UpdateSource } from "../features/updates/release-watch";
import { useAppUpdate } from "./use-app-update";

const OPEN: TillShiftState = {
  loaded: true,
  shift: { id: "s" } as unknown as Extract<TillShiftState, { loaded: true }>["shift"],
};
const CLOSED: TillShiftState = { loaded: true, shift: null };

function sourceOf() {
  let push: (available: string | null) => void = () => {};
  const source: UpdateSource = {
    subscribe(onChange) {
      push = onChange;
      return () => {};
    },
  };
  return { source, serve: (id: string | null) => act(() => push(id)) };
}

describe("applying a new release on the till", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it("with a shift open reloads only on the button, and only with nothing unsent", () => {
    const reload = vi.fn();
    const { source, serve } = sourceOf();
    const { result, rerender } = renderHook(
      ({ pending }) => useAppUpdate(source, OPEN, pending, reload),
      { initialProps: { pending: 2 } },
    );
    serve("2.0.0+new");
    expect(result.current.decision).toEqual({ action: "banner", blockedBy: "outbox" });
    act(() => result.current.updateNow());
    expect(reload).not.toHaveBeenCalled();
    rerender({ pending: 0 });
    act(() => vi.advanceTimersByTime(AUTO_APPLY_IDLE_MS * 3));
    expect(reload).not.toHaveBeenCalled();
    act(() => result.current.updateNow());
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("with no shift reloads by itself once idle, never with commands unsent", () => {
    const reload = vi.fn();
    const { source, serve } = sourceOf();
    const { rerender } = renderHook(
      ({ pending }) => useAppUpdate(source, CLOSED, pending, reload),
      {
        initialProps: { pending: 1 },
      },
    );
    serve("2.0.0+new");
    act(() => vi.advanceTimersByTime(AUTO_APPLY_IDLE_MS * 2));
    expect(reload).not.toHaveBeenCalled();
    rerender({ pending: 0 });
    act(() => vi.advanceTimersByTime(AUTO_APPLY_IDLE_MS * 2));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload while a dialog is open, nor again into a release it already tried", () => {
    const reload = vi.fn();
    const { source, serve } = sourceOf();
    const dialog = document.body.appendChild(document.createElement("div"));
    dialog.setAttribute("role", "dialog");
    renderHook(() => useAppUpdate(source, CLOSED, 0, reload));
    serve("2.0.0+new");
    act(() => vi.advanceTimersByTime(AUTO_APPLY_IDLE_MS * 2));
    expect(reload).not.toHaveBeenCalled();
    dialog.remove();
    act(() => vi.advanceTimersByTime(AUTO_APPLY_IDLE_MS));
    expect(reload).toHaveBeenCalledTimes(1);

    // The page came back still on the old release: the same id is not applied by itself again.
    const again = vi.fn();
    const next = sourceOf();
    renderHook(() => useAppUpdate(next.source, CLOSED, 0, again));
    next.serve("2.0.0+new");
    act(() => vi.advanceTimersByTime(AUTO_APPLY_IDLE_MS * 3));
    expect(again).not.toHaveBeenCalled();
  });

  it("does nothing when the served release is the running one", () => {
    const reload = vi.fn();
    const { source, serve } = sourceOf();
    const { result } = renderHook(() => useAppUpdate(source, CLOSED, 0, reload));
    serve(null);
    act(() => vi.advanceTimersByTime(AUTO_APPLY_IDLE_MS * 3));
    expect(result.current.decision).toEqual({ action: "none" });
    expect(reload).not.toHaveBeenCalled();
  });
});
