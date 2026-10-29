import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi as mock } from "vitest";
import { Listbox } from "./listbox";

const BRANCHES = [
  { value: "q1", label: "Quận 1" },
  { value: "q3", label: "Quận 3" },
  { value: "td", label: "Thủ Đức" },
];

function Picker({ onPicked }: { onPicked: (value: string) => void }) {
  const [value, setValue] = useState("q3");
  return (
    <Listbox
      label="Chi nhánh"
      value={value}
      choices={BRANCHES}
      onChange={(next) => {
        setValue(next);
        onPicked(next);
      }}
    />
  );
}

function open() {
  const onPicked = mock.fn();
  render(<Picker onPicked={onPicked} />);
  const box = screen.getByRole("combobox", { name: "Chi nhánh" });
  box.focus();
  return { box, onPicked };
}

const key = (box: HTMLElement, name: string) => fireEvent.keyDown(box, { key: name });
const active = (box: HTMLElement) => document.getElementById(box.getAttribute("aria-activedescendant") ?? "")?.textContent;

afterEach(cleanup);

describe("the app's own picker", () => {
  it("names the choice and keeps its list closed until asked", () => {
    const { box } = open();
    expect(box.textContent).toBe("Quận 3");
    expect(box.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens on the arrow keys at the current choice, walks, and picks with Enter", () => {
    const { box, onPicked } = open();
    key(box, "ArrowDown");
    expect(box.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("listbox", { name: "Chi nhánh" })).toBeTruthy();
    expect(active(box)).toBe("Quận 3");
    expect(screen.getByRole("option", { name: "Quận 3" }).getAttribute("aria-selected")).toBe("true");
    key(box, "ArrowDown");
    expect(active(box)).toBe("Thủ Đức");
    key(box, "ArrowDown");
    expect(active(box)).toBe("Thủ Đức");
    key(box, "Home");
    expect(active(box)).toBe("Quận 1");
    key(box, "End");
    key(box, "ArrowUp");
    expect(active(box)).toBe("Quận 3");
    key(box, "ArrowUp");
    key(box, "Enter");
    expect(onPicked).toHaveBeenCalledWith("q1");
    expect(box.textContent).toBe("Quận 1");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(box);
  });

  it("closes on Esc without a change, and on Space opens again", () => {
    const { box, onPicked } = open();
    key(box, " ");
    key(box, "ArrowDown");
    key(box, "Escape");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onPicked).not.toHaveBeenCalled();
    expect(box.textContent).toBe("Quận 3");
  });

  it("jumps to a choice by its first letters", () => {
    const { box, onPicked } = open();
    key(box, "t");
    expect(active(box)).toBe("Thủ Đức");
    key(box, "Enter");
    expect(onPicked).toHaveBeenCalledWith("td");
  });

  it("picks with a click and closes when the pointer goes down elsewhere", () => {
    const { box, onPicked } = open();
    fireEvent.click(box);
    fireEvent.click(screen.getByRole("option", { name: "Quận 1" }));
    expect(onPicked).toHaveBeenCalledWith("q1");
    fireEvent.click(box);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

const MENU = ["Trà sữa", "Trà đào", "Đá xay", "Sinh tố", "Cà phê", "Bạc xỉu", "Nước ép", "Bánh mì", "Đưa đón", "Sữa chua"].map(
  (label, at) => ({ value: `p${at}`, label }),
);

function longPicker(props: { searchable?: boolean; choices?: typeof MENU } = {}) {
  const onPicked = mock.fn();
  function Long() {
    const [value, setValue] = useState("p3");
    return (
      <Listbox
        label="Món"
        value={value}
        choices={props.choices ?? MENU}
        searchable={props.searchable}
        onChange={(next) => {
          setValue(next);
          onPicked(next);
        }}
      />
    );
  }
  render(<Long />);
  const box = screen.getByRole("combobox", { name: "Món" });
  box.focus();
  return { box, onPicked };
}

const searchBox = () => screen.getByRole("searchbox") as HTMLInputElement;
const typeInto = (text: string) => fireEvent.change(searchBox(), { target: { value: text } });
const names = () => within(screen.getByRole("listbox")).queryAllByRole("option").map((o) => o.textContent);

describe("the search box of a long list", () => {
  it("shows for a long list, not for a short one, and the caller can force either", () => {
    const first = longPicker();
    fireEvent.click(first.box);
    expect(screen.getByRole("searchbox")).toBeTruthy();
    cleanup();
    const short = longPicker({ choices: MENU.slice(0, 3) });
    fireEvent.click(short.box);
    expect(screen.queryByRole("searchbox")).toBeNull();
    cleanup();
    const forced = longPicker({ choices: MENU.slice(0, 3), searchable: true });
    fireEvent.click(forced.box);
    expect(screen.getByRole("searchbox")).toBeTruthy();
    cleanup();
    const off = longPicker({ searchable: false });
    fireEvent.click(off.box);
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("takes the focus when the list opens", () => {
    const { box } = longPicker();
    fireEvent.click(box);
    expect(document.activeElement).toBe(searchBox());
  });

  it("finds Vietnamese names typed without tone marks, đ as d, in any case", () => {
    const { box } = longPicker();
    fireEvent.click(box);
    typeInto("tra sua");
    expect(names()).toEqual(["Trà sữa"]);
    typeInto("DA");
    expect(names()).toEqual(["Trà đào", "Đá xay"]);
    typeInto("dua");
    expect(names()).toEqual(["Đưa đón"]);
    typeInto("đào");
    expect(names()).toEqual(["Trà đào"]);
    typeInto("SUA");
    expect(names()).toEqual(["Trà sữa", "Sữa chua"]);
  });

  it("says nothing was found when nothing matches", () => {
    const { box } = longPicker();
    fireEvent.click(box);
    typeInto("zzz");
    expect(names()).toEqual([]);
    expect(screen.getByText("Không tìm thấy")).toBeTruthy();
    typeInto("");
    expect(screen.queryByText("Không tìm thấy")).toBeNull();
    expect(names()).toHaveLength(MENU.length);
  });

  it("walks what is left with the arrows and picks with Enter", () => {
    const { box, onPicked } = longPicker();
    fireEvent.click(box);
    typeInto("sua");
    const input = searchBox();
    expect(input.getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[0]?.id);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(document.getElementById(input.getAttribute("aria-activedescendant") ?? "")?.textContent).toBe("Sữa chua");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(document.getElementById(input.getAttribute("aria-activedescendant") ?? "")?.textContent).toBe("Sữa chua");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onPicked).toHaveBeenCalledWith("p0");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(box);
    expect(box.textContent).toBe("Trà sữa");
  });

  it("keeps the list open on Enter while no choice is left, and closes on Esc with the focus back on the button", () => {
    const { box, onPicked } = longPicker();
    fireEvent.click(box);
    typeInto("zzz");
    fireEvent.keyDown(searchBox(), { key: "Enter" });
    expect(onPicked).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(searchBox(), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onPicked).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(box);
    fireEvent.click(box);
    expect(searchBox().value).toBe("");
  });

  it("leaves a syllable still being composed alone", () => {
    const { box, onPicked } = longPicker();
    fireEvent.click(box);
    typeInto("tra");
    fireEvent.keyDown(searchBox(), { key: "Enter", isComposing: true });
    expect(onPicked).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toBeTruthy();
  });

  it("opens already searching for the first letter typed on the closed button", () => {
    const { box } = longPicker();
    key(box, "b");
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(names()).toEqual(["Bạc xỉu", "Bánh mì"]);
  });

  it("picks with a click on a found choice", () => {
    const { box, onPicked } = longPicker();
    fireEvent.click(box);
    typeInto("ca phe");
    fireEvent.click(screen.getByRole("option", { name: "Cà phê" }));
    expect(onPicked).toHaveBeenCalledWith("p4");
  });
});

describe("the list leaving", () => {
  beforeEach(() => {
    mock.useFakeTimers();
    document.documentElement.style.setProperty("--t-exit", "140ms");
  });
  afterEach(() => {
    mock.useRealTimers();
    document.documentElement.style.removeProperty("--t-exit");
  });

  it("stays, marked and inert, for the movement and then goes with no animation event", () => {
    const { box } = open();
    fireEvent.click(box);
    key(box, "Escape");
    const popup = screen.getByRole("listbox", { hidden: true }).parentElement as HTMLElement;
    expect(popup.hasAttribute("data-leaving")).toBe(true);
    expect(popup.hasAttribute("inert")).toBe(true);
    expect(box.getAttribute("aria-expanded")).toBe("false");
    act(() => void mock.advanceTimersByTime(200));
    expect(screen.queryByRole("listbox", { hidden: true })).toBeNull();
  });

  it("does not pick, nor double, when asked for again while it leaves", () => {
    const { box, onPicked } = open();
    fireEvent.click(box);
    const before = screen.getByRole("listbox").parentElement;
    key(box, "Escape");
    act(() => void mock.advanceTimersByTime(50));
    fireEvent.click(box);
    expect(screen.getAllByRole("listbox")).toHaveLength(1);
    expect(screen.getByRole("listbox").parentElement).toBe(before);
    expect(before?.hasAttribute("data-leaving")).toBe(false);
    act(() => void mock.advanceTimersByTime(500));
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(onPicked).not.toHaveBeenCalled();
  });

  it("gives the focus back to the button it was opened from after a pick in the search box", () => {
    const { box } = longPicker();
    fireEvent.click(box);
    typeInto("ca phe");
    fireEvent.keyDown(searchBox(), { key: "Enter" });
    expect(document.activeElement).toBe(box);
    act(() => void mock.advanceTimersByTime(200));
    expect(document.activeElement).toBe(box);
    expect(screen.queryByRole("listbox", { hidden: true })).toBeNull();
  });
});
