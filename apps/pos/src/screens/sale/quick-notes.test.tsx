import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_NOTE_LENGTH } from "../../features/order/counter-order";
import { QuickNotes, toggleQuickNote } from "./quick-notes";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("toggleQuickNote", () => {
  it("adds a phrase after what was typed and takes it out on a second tap", () => {
    expect(toggleQuickNote("", "Ít đá")).toBe("Ít đá");
    expect(toggleQuickNote("giao bàn 5", "Ít đá")).toBe("giao bàn 5, Ít đá");
    expect(toggleQuickNote("giao bàn 5, Ít đá", "Ít đá")).toBe("giao bàn 5");
  });

  it("does not add a phrase that would make the note too long", () => {
    const full = "x".repeat(MAX_NOTE_LENGTH - 2);
    expect(toggleQuickNote(full, "Ít đá")).toBe(full);
  });
});

function Field() {
  const [note, setNote] = useState("");
  return (
    <>
      <QuickNotes note={note} onChange={setNote} />
      <output data-testid="note">{note}</output>
    </>
  );
}

describe("the quick note chips", () => {
  it("write into the note and show which phrases it holds", () => {
    render(<Field />);
    fireEvent.click(screen.getByRole("button", { name: "Ít đá" }));
    fireEvent.click(screen.getByRole("button", { name: "Không đường" }));
    expect(screen.getByTestId("note").textContent).toBe("Ít đá, Không đường");
    expect(screen.getByRole("button", { name: "Ít đá" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Đá riêng" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });
});
