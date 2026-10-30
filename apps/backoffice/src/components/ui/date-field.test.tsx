import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi as mock } from "vitest";
import { vi } from "../../messages/vi";
import { DateField } from "./date-field";

const T = vi.dateField;

/** The field as a page holds it: the day lives in the page, the field only reads and tells. */
function Page(props: {
  start: string;
  min?: string;
  max?: string;
  seen?: (day: string) => void;
  label?: string;
}) {
  const [day, setDay] = useState(props.start);
  return (
    <DateField
      label={props.label ?? "Ngày bán"}
      value={day}
      min={props.min}
      max={props.max}
      onChange={(next) => {
        props.seen?.(next);
        setDay(next);
      }}
    />
  );
}

const box = (label = "Ngày bán") => screen.getByLabelText(label) as HTMLInputElement;
const openCalendar = (label = "Ngày bán") =>
  fireEvent.click(screen.getByRole("button", { name: `${T.openCalendar}: ${label}` }));
const dayButton = (text: string) => screen.getByRole("button", { name: text });

describe("the day field", () => {
  it("writes the day day first, whatever the language of the browser", () => {
    render(<Page start="2026-10-30" />);
    expect(box().value).toBe("30/10/2026");
    expect(box().getAttribute("type")).toBe("text");
  });

  it("tells the page of a day typed in full, and of nothing while it is half typed", () => {
    const seen = mock.fn();
    render(<Page start="2026-10-30" seen={seen} />);
    fireEvent.change(box(), { target: { value: "1/1" } });
    expect(seen).not.toHaveBeenCalled();
    fireEvent.change(box(), { target: { value: "3/1/2026" } });
    expect(seen).toHaveBeenLastCalledWith("2026-01-03");
    expect(box().value).toBe("03/01/2026");
  });

  it.each(["ab/cd/efgh", "31/04/2026", "10/30/2026", "😀😀", "０１/０１/２０２６", "30/10/20266"])(
    "keeps %j in the box with its reason and tells the page nothing",
    (text) => {
      const seen = mock.fn();
      render(<Page start="2026-10-30" seen={seen} />);
      fireEvent.change(box(), { target: { value: text } });
      fireEvent.blur(box());
      expect(seen).not.toHaveBeenCalled();
      expect(screen.getByRole("alert").textContent).toBe(T.notADay);
      expect(box().getAttribute("aria-invalid")).toBe("true");
    },
  );

  it("tells the page at once that an emptied box gives no day", () => {
    const seen = mock.fn();
    render(<Page start="2026-10-30" seen={seen} />);
    fireEvent.change(box(), { target: { value: "" } });
    expect(seen).toHaveBeenLastCalledWith("");
    fireEvent.blur(box());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("refuses a day past the limit and says which", () => {
    const seen = mock.fn();
    render(<Page start="2026-10-30" max="2026-10-30" seen={seen} />);
    fireEvent.change(box(), { target: { value: "31/10/2026" } });
    fireEvent.blur(box());
    expect(seen).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(T.tooLate("30/10/2026"));
  });

  it("follows the page when it changes the day", () => {
    const { rerender } = render(
      <DateField label="Ngày bán" value="2026-10-30" onChange={() => {}} />,
    );
    fireEvent.change(box(), { target: { value: "zz" } });
    fireEvent.blur(box());
    rerender(<DateField label="Ngày bán" value="2026-10-29" onChange={() => {}} />);
    expect(box().value).toBe("29/10/2026");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("the calendar", () => {
  it("opens on the day given, marks it, picks another, and closes", async () => {
    const seen = mock.fn();
    render(<Page start="2026-10-30" seen={seen} />);
    openCalendar();
    const dialog = screen.getByRole("dialog", { name: `${T.calendar}: Ngày bán` });
    expect(within(dialog).getByText("Tháng 10 năm 2026")).toBeTruthy();
    expect(dayButton("30/10/2026").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(dayButton("12/10/2026"));
    expect(seen).toHaveBeenLastCalledWith("2026-10-12");
    expect(box().value).toBe("12/10/2026");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("starts the week on Monday and walks months, the days around a month included", () => {
    render(<Page start="2026-10-30" />);
    openCalendar();
    const names = [...document.querySelectorAll(".bo-date-field__week span")].map(
      (s) => s.textContent,
    );
    expect(names).toEqual(["T2", "T3", "T4", "T5", "T6", "T7", "CN"]);
    // October 2026 starts on a Thursday: the first row begins with 28 September.
    expect(dayButton("28/09/2026")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: T.nextMonth }));
    expect(screen.getByText("Tháng 11 năm 2026")).toBeTruthy();
    fireEvent.click(dayButton("15/11/2026"));
    expect(box().value).toBe("15/11/2026");
  });

  it("fades the days past the limit and refuses them, and stops the month arrow there", () => {
    const seen = mock.fn();
    render(<Page start="2026-10-30" min="2026-10-05" max="2026-10-30" seen={seen} />);
    openCalendar();
    expect((dayButton("31/10/2026") as HTMLButtonElement).disabled).toBe(true);
    expect((dayButton("04/10/2026") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: T.nextMonth }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(
      (screen.getByRole("button", { name: T.previousMonth }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(dayButton("31/10/2026"));
    expect(seen).not.toHaveBeenCalled();
  });

  it("is walked by the keys: arrows, Page Up, Home, End; Enter picks; Esc gives the focus back", async () => {
    const seen = mock.fn();
    render(<Page start="2026-10-14" seen={seen} />);
    openCalendar();
    const focusedDay = () => document.activeElement?.getAttribute("aria-label");
    await waitFor(() => expect(focusedDay()).toBe("14/10/2026"));
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    await waitFor(() => expect(focusedDay()).toBe("15/10/2026"));
    fireEvent.keyDown(dialog, { key: "ArrowDown" });
    await waitFor(() => expect(focusedDay()).toBe("22/10/2026"));
    fireEvent.keyDown(dialog, { key: "Home" });
    await waitFor(() => expect(focusedDay()).toBe("19/10/2026"));
    fireEvent.keyDown(dialog, { key: "End" });
    await waitFor(() => expect(focusedDay()).toBe("25/10/2026"));
    fireEvent.keyDown(dialog, { key: "PageUp" });
    await waitFor(() => expect(focusedDay()).toBe("25/09/2026"));
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: `${T.openCalendar}: Ngày bán` }),
    );
    expect(seen).not.toHaveBeenCalled();
  });

  it("does not walk the keys to a day that cannot be given", async () => {
    render(<Page start="2026-10-30" max="2026-10-30" />);
    openCalendar();
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    fireEvent.keyDown(dialog, { key: "ArrowDown" });
    await waitFor(() =>
      expect(document.activeElement?.getAttribute("aria-label")).toBe("30/10/2026"),
    );
  });

  it("gives today from its own button, and closes on a click outside", async () => {
    const seen = mock.fn();
    render(
      <div>
        <Page start="2020-01-01" seen={seen} />
        <button type="button">ngoài</button>
      </div>,
    );
    openCalendar();
    fireEvent.click(screen.getByRole("button", { name: T.today }));
    expect(seen).toHaveBeenCalledTimes(1);
    openCalendar();
    fireEvent.pointerDown(screen.getByRole("button", { name: "ngoài" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
