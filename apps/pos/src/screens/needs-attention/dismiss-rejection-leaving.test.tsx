import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi as mock } from "vitest";
import { vi as text } from "../../messages/vi";
import { DismissRejectionScreen, type DismissResult } from "./dismiss-rejection-screen";

const realMatchMedia = window.matchMedia;
const D = text.needsAttention.dismissal;

beforeEach(() => {
  mock.useFakeTimers();
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
  })) as unknown as typeof window.matchMedia;
  document.documentElement.style.setProperty("--t-exit", "140ms");
});

afterEach(() => {
  cleanup();
  mock.useRealTimers();
  window.matchMedia = realMatchMedia;
  document.documentElement.style.removeProperty("--t-exit");
});

const wait = (ms: number) => act(() => void mock.advanceTimersByTime(ms));

function setAside(result: DismissResult) {
  const onDone = mock.fn();
  const onBack = mock.fn();
  render(
    <DismissRejectionScreen
      commandType="order.save_draft"
      code="SYNC_ORDER_VERSION_STALE"
      reasons={["handled_by_hand", "no_longer_needed"]}
      needsWords={false}
      onConfirm={() => Promise.resolve(result)}
      onDone={onDone}
      onBack={onBack}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: text.reasons.handled_by_hand }));
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: D.confirm }));
  });
  return { onDone, onBack };
}

const leaving = () => document.querySelector("main")?.hasAttribute("data-leaving");

describe("setting a refused command aside", () => {
  it("sinks away when it is done, and hands over once the movement has played", async () => {
    const { onDone, onBack } = setAside({ kind: "done" });
    await act(async () => void (await Promise.resolve()));
    expect(leaving()).toBe(true);
    wait(100);
    expect(onDone).not.toHaveBeenCalled();
    wait(100);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();
  });

  it("stays, with the reason to read, when the server's answer refuses it", async () => {
    const { onDone } = setAside({ kind: "refused", message: "Chưa làm được. Thử lại." });
    await act(async () => void (await Promise.resolve()));
    expect(screen.getByRole("alert").textContent).toBe("Chưa làm được. Thử lại.");
    expect(leaving()).toBe(false);
    wait(300);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("stays as it was, with nothing said, when nobody approved", async () => {
    const { onDone } = setAside({ kind: "nothing" });
    await act(async () => void (await Promise.resolve()));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(leaving()).toBe(false);
    wait(300);
    expect(onDone).not.toHaveBeenCalled();
    // The confirm button is back for another try.
    expect((screen.getByRole("button", { name: D.confirm }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});
