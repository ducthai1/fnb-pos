import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi } from "../../messages/vi";
import { LoginAside } from "./login-aside";

describe("the panel beside the sign-in form", () => {
  it("says what the backoffice is for, one line a point, under its own heading", () => {
    render(<LoginAside />);
    const aside = screen.getByRole("complementary", { name: vi.login.asideTitle });
    expect(within(aside).getAllByRole("listitem").map((item) => item.textContent)).toEqual([...vi.login.asidePoints]);
  });
});
