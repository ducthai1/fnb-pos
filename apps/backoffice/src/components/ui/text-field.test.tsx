import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { type FormEvent, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ConfirmPanel } from "./confirm-panel";
import { FieldRow, TextField } from "./text-field";

const REQUIRED = "Nhập tên, tối đa 60 ký tự.";

/** A form like the floor's "new area": the page clears the name once it is saved. */
function AreaForm() {
  const [name, setName] = useState("");
  const add = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() !== "") setName("");
  };
  return (
    <form onSubmit={add} noValidate>
      <FieldRow>
        <TextField label="Tên khu vực mới" value={name} onChange={setName} error={name.trim() === "" ? REQUIRED : undefined} />
        <button type="submit">Thêm khu vực</button>
      </FieldRow>
    </form>
  );
}

const field = () => screen.getByLabelText("Tên khu vực mới");
const error = () => screen.queryByText(REQUIRED);

afterEach(cleanup);

describe("the one field of the backoffice", () => {
  it("is never red before the person did anything with it", () => {
    render(<AreaForm />);
    expect(error()).toBeNull();
    expect(field().getAttribute("aria-invalid")).toBeNull();
    // Only passing through it, without typing, is not doing anything yet.
    fireEvent.focus(field());
    fireEvent.blur(field());
    expect(error()).toBeNull();
  });

  it("shows the error once its form is sent, ties it to the box, and drops it once fixed", () => {
    render(<AreaForm />);
    fireEvent.click(screen.getByRole("button", { name: "Thêm khu vực" }));
    expect(error()).not.toBeNull();
    expect(field().getAttribute("aria-invalid")).toBe("true");
    expect(field().getAttribute("aria-describedby")).toBe(error()?.id);
    fireEvent.change(field(), { target: { value: "Sân thượng" } });
    expect(error()).toBeNull();
  });

  it("shows the error once the person typed and left the field", () => {
    render(<AreaForm />);
    fireEvent.change(field(), { target: { value: "a" } });
    fireEvent.change(field(), { target: { value: "" } });
    expect(error()).toBeNull();
    fireEvent.blur(field());
    expect(error()).not.toBeNull();
  });

  it("starts over, not red, once the form saved and the page emptied it", () => {
    render(<AreaForm />);
    fireEvent.change(field(), { target: { value: "Tầng 2" } });
    fireEvent.blur(field());
    fireEvent.click(screen.getByRole("button", { name: "Thêm khu vực" }));
    expect((field() as HTMLInputElement).value).toBe("");
    expect(error()).toBeNull();
  });

  it("shows a step's field errors once the step's button is pressed", () => {
    render(
      <ConfirmPanel
        title="Trả lại tiền?"
        hint="Tiền về lại khách."
        confirmLabel="Trả lại"
        busyLabel="Đang trả…"
        busy={false}
        error={null}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      >
        <TextField label="Ghi chú" value="" onChange={() => undefined} error="Nhập ghi chú." />
      </ConfirmPanel>,
    );
    expect(screen.queryByText("Nhập ghi chú.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Trả lại" }));
    expect(screen.queryByText("Nhập ghi chú.")).not.toBeNull();
  });

  it("keeps the button of a row of fields level with the boxes, whatever grows under them", () => {
    render(<AreaForm />);
    const row = screen.getByRole("button", { name: "Thêm khu vực" }).parentElement!;
    expect(row.classList.contains("bo-field-row")).toBe(true);
    expect(row.contains(field())).toBe(true);
    // The row lines its children up at their top, so an error under a box does not move the button.
    const css = readFileSync(join(process.cwd(), "src/app/backoffice-controls.css"), "utf8");
    const rule = /\.bo-field-row \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toContain("align-items: flex-start");
  });
});
