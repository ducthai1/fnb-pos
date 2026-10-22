import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi as mock } from "vitest";
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
