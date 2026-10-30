import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi as mock } from "vitest";
import { startTillTheme } from "../../features/theme/till-theme";
import { vi as text } from "../../messages/vi";
import { CancelOrderScreen } from "../order-adjust/cancel-order-screen";
import { ThemeMenu } from "../till/theme-menu";
import { SideDrawer } from "./side-drawer";
import { Presence } from "./presence";
import { useFinishThen, usePresence } from "./use-leave-motion";

/** A device that plays motion: matchMedia exists and does not ask for it to be reduced. */
const realMatchMedia = window.matchMedia;

beforeEach(() => {
  mock.useFakeTimers();
  window.matchMedia = ((query: string) => ({ matches: false, media: query })) as unknown as typeof window.matchMedia;
  for (const token of ["--t-exit", "--t-drawer-out"]) {
    document.documentElement.style.setProperty(token, "140ms");
  }
});

afterEach(() => {
  cleanup();
  mock.useRealTimers();
  window.matchMedia = realMatchMedia;
  document.documentElement.style.removeProperty("--t-exit");
  document.documentElement.style.removeProperty("--t-drawer-out");
  document.documentElement.removeAttribute("data-motion");
});

const wait = (ms: number) => act(() => void mock.advanceTimersByTime(ms));

function Layer({ open }: { open: boolean }) {
  const { present, leaving } = usePresence(open, "--t-exit");
  return present ? <div data-testid="layer" data-leaving={leaving ? "" : undefined} /> : null;
}

describe("a layer leaving the till", () => {
  it("goes at a timer with no animation event, and not before the movement", () => {
    const view = render(<Layer open />);
    view.rerender(<Layer open={false} />);
    expect(screen.getByTestId("layer").hasAttribute("data-leaving")).toBe(true);
    wait(100);
    expect(screen.queryByTestId("layer")).not.toBeNull();
    wait(100);
    expect(screen.queryByTestId("layer")).toBeNull();
  });

  it("keeps one unmarked element when asked for again while it leaves", () => {
    const view = render(<Layer open />);
    const first = screen.getByTestId("layer");
    view.rerender(<Layer open={false} />);
    wait(50);
    view.rerender(<Layer open />);
    wait(500);
    expect(screen.getAllByTestId("layer")).toHaveLength(1);
    expect(screen.getByTestId("layer")).toBe(first);
    expect(first.hasAttribute("data-leaving")).toBe(false);
  });

  it("goes at once when the page has motion off", () => {
    document.documentElement.dataset.motion = "off";
    const view = render(<Layer open />);
    view.rerender(<Layer open={false} />);
    expect(screen.queryByTestId("layer")).toBeNull();
  });

  it("goes at once on a device that asks for reduced motion", () => {
    window.matchMedia = ((query: string) => ({ matches: true, media: query })) as unknown as typeof window.matchMedia;
    const view = render(<Layer open />);
    view.rerender(<Layer open={false} />);
    expect(screen.queryByTestId("layer")).toBeNull();
  });

  it("lets the look menu fade out, inert, and gives the focus to its button", () => {
    const theme = startTillTheme({ root: document.documentElement, storage: () => window.localStorage });
    render(<ThemeMenu theme={theme} />);
    const button = screen.getByRole("button", { name: text.theme.open });
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    const menu = screen.getByRole("menu", { hidden: true });
    expect(menu.hasAttribute("data-leaving")).toBe(true);
    expect(menu.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(button);
    wait(200);
    expect(screen.queryByRole("menu", { hidden: true })).toBeNull();
    theme.stop();
  });

  it("lets a step over the order sink before Back is handed to the flow", () => {
    const onBack = mock.fn();
    render(<CancelOrderScreen header={null} orderNo={7} onConfirm={() => Promise.resolve(null)} onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: text.adjust.back }));
    expect(document.querySelector("main")?.hasAttribute("data-leaving")).toBe(true);
    expect(onBack).not.toHaveBeenCalled();
    wait(100);
    expect(onBack).not.toHaveBeenCalled();
    wait(100);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("asks a drawer's owner to close it only once it has slid out, whatever is tapped meanwhile", () => {
    const onClose = mock.fn();
    render(
      <SideDrawer title="Thanh toán" closeLabel="Quay lại" onClose={onClose}>
        <p>nội dung</p>
      </SideDrawer>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Quay lại" }));
    fireEvent.click(screen.getByRole("button", { name: "Quay lại", hidden: true }));
    wait(100);
    expect(onClose).not.toHaveBeenCalled();
    wait(100);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("lets a step whose work is done sink away before the flow is handed the outcome", () => {
    const onDone = mock.fn();
    render(
      <CancelOrderScreen header={null} orderNo={7} closing onConfirm={() => Promise.resolve(null)} onBack={onDone} />,
    );
    // A step told its work is done wears the same leaving mark as one backed out of.
    expect(document.querySelector("main")?.hasAttribute("data-leaving")).toBe(true);
  });
});

function Finisher({ onDone }: { onDone: (outcome: string) => void }) {
  const { closing, finish } = useFinishThen(onDone);
  return (
    <button type="button" data-closing={closing ? "" : undefined} onClick={() => finish("cancelled")}>
      xong
    </button>
  );
}

describe("a step finishing because its work is done", () => {
  it("is marked closing for the movement, then hands the outcome over once, however often it is finished", () => {
    const onDone = mock.fn();
    render(<Finisher onDone={onDone} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button").hasAttribute("data-closing")).toBe(true);
    wait(100);
    expect(onDone).not.toHaveBeenCalled();
    wait(100);
    expect(onDone.mock.calls).toEqual([["cancelled"]]);
  });

  it("hands the outcome over at once when the page has motion off or the device asks for less", () => {
    const onDone = mock.fn();
    document.documentElement.dataset.motion = "off";
    render(<Finisher onDone={onDone} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onDone.mock.calls).toEqual([["cancelled"]]);
    cleanup();
    document.documentElement.removeAttribute("data-motion");
    window.matchMedia = ((query: string) => ({ matches: true, media: query })) as unknown as typeof window.matchMedia;
    render(<Finisher onDone={onDone} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onDone).toHaveBeenCalledTimes(2);
  });
});

describe("a notice that goes from the page", () => {
  it("sinks away still saying what it said, and is gone after the movement", () => {
    const view = render(<Presence><p role="alert">Còn món chưa gửi bếp</p></Presence>);
    view.rerender(<Presence>{null}</Presence>);
    const notice = screen.getByRole("alert");
    expect(notice.textContent).toBe("Còn món chưa gửi bếp");
    expect(notice.parentElement?.hasAttribute("data-leaving")).toBe(true);
    wait(100);
    expect(screen.queryByRole("alert")).not.toBeNull();
    wait(100);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("goes at once on a device that asks for reduced motion", () => {
    window.matchMedia = ((query: string) => ({ matches: true, media: query })) as unknown as typeof window.matchMedia;
    const view = render(<Presence><p role="alert">Báo</p></Presence>);
    view.rerender(<Presence>{null}</Presence>);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
