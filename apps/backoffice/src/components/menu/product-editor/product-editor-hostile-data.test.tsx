import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi } from "../../../messages/vi";
import { fakeCatalog } from "../../../test-support/fake-catalog";
import { HOSTILE_MENU, hostileToppingNames } from "../../../test-support/hostile-catalog";
import { TEA, milkTeaDraft } from "../../../test-support/milk-tea-draft";
import { renderSignedIn } from "../../../test-support/render-signed-in";
import { checkProductDraft } from "./check-product-draft";
import type { ProductDraft } from "./product-draft";
import { ProductEditorScreen } from "./product-editor-screen";

const T = vi.menu.editor;
const id = (n: number) => `0190a000-0000-7000-8000-${(0x900 + n).toString(16).padStart(12, "0")}`;

/** The milk tea with names nobody would design for and a topping group of 30. */
function hostileTea(): ProductDraft {
  const draft = milkTeaDraft();
  return {
    ...draft,
    name: HOSTILE_MENU.productName,
    variants: [draft.variants[0]!, { ...draft.variants[1]!, name: HOSTILE_MENU.sizeName }],
    modifierGroups: draft.modifierGroups.map((group) =>
      group.id !== TEA.topping
        ? group
        : {
            ...group,
            name: HOSTILE_MENU.groupName,
            options: hostileToppingNames().map((name, index) => ({
              id: id(index),
              name,
              priceDelta: index === 0 ? "0" : "1.000.000",
              maxQuantity: "",
            })),
          },
    ),
  };
}

describe("the editor with hostile menu data", () => {
  it("shows 30 toppings with their names intact, previews them, and saves them unchanged", async () => {
    const catalog = fakeCatalog();
    const check = checkProductDraft({ ...hostileTea(), version: null });
    if (!check.ok) throw new Error(JSON.stringify(check.errors));
    await catalog.putProduct(TEA.product, check.body);
    catalog.putProduct.mockClear();
    await renderSignedIn(<ProductEditorScreen productId={TEA.product} isNew={false} />, catalog.api);

    const toppings = await screen.findByRole("region", { name: T.groupLabel(3) });
    const names = within(toppings)
      .getAllByLabelText(T.optionName)
      .map((field) => (field as HTMLInputElement).value);
    expect(names).toEqual(hostileToppingNames());
    expect((screen.getByLabelText(T.name) as HTMLInputElement).value).toBe(HOSTILE_MENU.productName);

    const preview = screen.getByRole("region", { name: vi.menu.preview.title });
    fireEvent.click(within(preview).getByRole("radio", { name: HOSTILE_MENU.sizeName }));
    fireEvent.click(within(preview).getByRole("checkbox", { name: /^100%/ }));
    fireEvent.click(within(preview).getByRole("checkbox", { name: /^Bình thường/ }));
    const toppingNames = hostileToppingNames();
    for (const name of toppingNames.slice(0, 5)) {
      fireEvent.click(within(preview).getByRole("button", { name: vi.menu.preview.more(name) }));
    }
    // 45.000 for the size, the first topping free, four at 1.000.000.
    expect(preview.querySelector("[data-preview-total]")?.textContent).toMatch(/4\.045\.000\s₫$/);

    fireEvent.click(screen.getByRole("button", { name: T.save }));
    await screen.findByText(T.saved);
    const [, body] = catalog.putProduct.mock.calls[0]!;
    expect(body.modifierGroups[2]?.options.map((option) => option.name)).toEqual(toppingNames);
    expect(body.name).toBe(HOSTILE_MENU.productName);
  });

  it("refuses a name past the 120 characters the API stores, at that name", async () => {
    const catalog = fakeCatalog();
    await renderSignedIn(<ProductEditorScreen productId={TEA.product} isNew />, catalog.api);
    fireEvent.change(await screen.findByLabelText(T.name), {
      target: { value: `${HOSTILE_MENU.productName}${HOSTILE_MENU.productName}` },
    });
    fireEvent.change(screen.getByLabelText(T.basePrice), { target: { value: "35000" } });
    fireEvent.click(screen.getByRole("button", { name: T.save }));
    await screen.findByText(T.hasErrors);
    expect(screen.getByLabelText(T.name).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(T.nameTooLong)).toBeTruthy();
    expect(catalog.putProduct).not.toHaveBeenCalled();
  });
});
