import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi as mock } from "vitest";
import { vi } from "../../../messages/vi";
import { fakeCatalog } from "../../../test-support/fake-catalog";
import { TEA, milkTeaDraft } from "../../../test-support/milk-tea-draft";
import { renderSignedIn } from "../../../test-support/render-signed-in";
import { checkProductDraft } from "./check-product-draft";
import { EDITOR_SECTIONS } from "./editor-sections";
import { ProductEditorScreen } from "./product-editor-screen";

const T = vi.menu.editor;

async function openTea() {
  const catalog = fakeCatalog();
  const check = checkProductDraft({ ...milkTeaDraft(), version: null });
  if (!check.ok) throw new Error("the milk tea does not check");
  await catalog.putProduct(TEA.product, check.body);
  await renderSignedIn(<ProductEditorScreen productId={TEA.product} isNew={false} />, catalog.api);
  await screen.findByLabelText(T.name);
}

describe("the parts of the product editor", () => {
  it("keeps every part on the page, price and tax in a part of their own", async () => {
    await openTea();
    const price = document.getElementById(EDITOR_SECTIONS.price)!;
    expect(within(price).getByLabelText(T.basePrice)).toBeTruthy();
    expect(within(price).getByLabelText(T.taxRate)).toBeTruthy();
    expect(within(document.getElementById(EDITOR_SECTIONS.info)!).queryByLabelText(T.basePrice)).toBeNull();
    for (const id of Object.values(EDITOR_SECTIONS)) expect(document.getElementById(id)).not.toBeNull();
  });

  it("goes to a part from its segment and marks it", async () => {
    await openTea();
    const parts = screen.getByRole("group", { name: T.sectionsLabel });
    const scrolled = mock.fn();
    document.getElementById(EDITOR_SECTIONS.groups)!.scrollIntoView = scrolled;
    const groups = within(parts).getByRole("button", { name: T.sections.groups });
    expect(groups.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(groups);
    expect(scrolled).toHaveBeenCalledOnce();
    expect(groups.getAttribute("aria-pressed")).toBe("true");
    expect(within(parts).getByRole("button", { name: T.sections.info }).getAttribute("aria-pressed")).toBe("false");
  });

  it("says where the product sits: home, the menu, the product list, then its name", async () => {
    await openTea();
    const trail = screen.getByRole("list", { name: vi.shell.breadcrumb });
    expect(within(trail).getByRole("link", { name: vi.shell.nav.products }).getAttribute("href")).toBe("/menu");
    expect(within(trail).getByText(milkTeaDraft().name).getAttribute("aria-current")).toBe("page");
  });
});
