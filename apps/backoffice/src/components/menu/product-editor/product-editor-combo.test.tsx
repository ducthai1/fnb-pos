import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { messageForCode } from "../../../lib/errors/failure-message";
import { vi } from "../../../messages/vi";
import { fakeCatalog } from "../../../test-support/fake-catalog";
import { TEA, milkTeaDraft } from "../../../test-support/milk-tea-draft";
import { renderSignedIn } from "../../../test-support/render-signed-in";
import { checkProductDraft } from "./check-product-draft";
import { ProductEditorScreen } from "./product-editor-screen";

const T = vi.menu.editor;
const P = vi.menu.preview;
const COMBO_ID = "0190a000-0000-7000-8000-0000000000f3";
const CROISSANT = "0190a000-0000-7000-8000-0000000000f4";

const type = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } });

/** Opens the picker named `label` (inside `scope`) and takes `choice` from its list. */
function pick(scope: HTMLElement, label: string, choice: string) {
  const picker = within(scope).getByRole("combobox", { name: label });
  expect(picker.tagName).toBe("BUTTON");
  fireEvent.click(picker);
  fireEvent.click(screen.getByRole("option", { name: choice }));
}

/** A catalog with the sized milk tea and a croissant sold in one form. */
async function seededMenu() {
  const catalog = fakeCatalog();
  const tea = checkProductDraft({ ...milkTeaDraft(), version: null });
  const croissant = checkProductDraft({
    ...milkTeaDraft(),
    id: CROISSANT,
    version: null,
    name: "Bánh croissant",
    kind: "prepared_item",
    variants: [],
    modifierGroups: [],
  });
  if (!tea.ok || !croissant.ok) throw new Error("the seed products do not check");
  await catalog.putProduct(TEA.product, tea.body);
  await catalog.putProduct(CROISSANT, croissant.body);
  catalog.putProduct.mockClear();
  return catalog;
}

const slotCard = (index: number) => screen.getByRole("region", { name: T.slotLabel(index) });
const row = (slot: HTMLElement, index: number) =>
  within(slot).getByRole("group", { name: T.slotOptionLabel(index) });

describe("the product editor for a combo", () => {
  it("creates a combo slot by slot, each sized product with its size and upcharge", async () => {
    const catalog = await seededMenu();
    await renderSignedIn(<ProductEditorScreen productId={COMBO_ID} isNew />, catalog.api);
    type(await screen.findByLabelText(T.name), "Combo sáng");
    pick(document.body, T.kind, T.kinds.combo);
    // A combo has no sizes or option groups of its own, and sells at a fixed price.
    expect(screen.queryByRole("button", { name: T.addGroup })).toBeNull();
    expect(screen.queryByRole("combobox", { name: T.pricingMode })).toBeNull();
    type(screen.getByLabelText(T.basePrice), "50.000");

    const drinks = slotCard(1);
    type(within(drinks).getByLabelText(T.slotName), "Đồ uống");
    pick(row(drinks, 1), T.slotProduct, "Trà sữa trân châu");
    // A sized product takes its first size; the next row is the L, for 10.000 more.
    expect(within(row(drinks, 1)).getByRole("combobox", { name: T.slotVariant }).textContent).toBe(
      "M",
    );
    fireEvent.click(within(drinks).getByRole("button", { name: T.addSlotOption }));
    pick(row(drinks, 2), T.slotProduct, "Trà sữa trân châu");
    pick(row(drinks, 2), T.slotVariant, "L");
    type(within(row(drinks, 2)).getByLabelText(T.upcharge), "10.000");

    fireEvent.click(screen.getByRole("button", { name: T.addSlot }));
    const bakery = slotCard(2);
    type(within(bakery).getByLabelText(T.slotName), "Bánh");
    type(within(bakery).getByLabelText(T.slotMin), "0");
    type(within(bakery).getByLabelText(T.slotMax), "2");
    pick(row(bakery, 1), T.slotProduct, "Bánh croissant");
    expect(within(row(bakery, 1)).queryByRole("combobox", { name: T.slotVariant })).toBeNull();

    // The preview fills it like the till: the L costs its upcharge on top of the combo.
    fireEvent.click(screen.getByLabelText(`Trà sữa trân châu (L) ${P.upcharge("10.000 ₫")}`));
    const total = document.querySelector("[data-preview-total]")?.textContent ?? "";
    expect(total.replace(/\u00a0/g, " ")).toBe(P.comboTotal("60.000 ₫"));

    fireEvent.click(screen.getByRole("button", { name: T.save }));
    await screen.findByText(T.saved);
    const [, body] = catalog.putProduct.mock.calls[0]!;
    expect(body).toMatchObject({ kind: "combo", pricingMode: "fixed", basePrice: 50_000 });
    expect(body.combo?.slots).toEqual([
      {
        id: expect.any(String),
        name: "Đồ uống",
        minSelect: 1,
        maxSelect: 1,
        options: [
          { productId: TEA.product, variantId: TEA.sizeM, upcharge: 0 },
          { productId: TEA.product, variantId: TEA.sizeL, upcharge: 10_000 },
        ],
      },
      {
        id: expect.any(String),
        name: "Bánh",
        minSelect: 0,
        maxSelect: 2,
        options: [{ productId: CROISSANT, variantId: null, upcharge: 0 }],
      },
    ]);
    // The combo itself is not offered inside its own slots.
    fireEvent.click(within(row(slotCard(2), 1)).getByRole("combobox", { name: T.slotProduct }));
    expect(screen.queryByRole("option", { name: "Combo sáng" })).toBeNull();
  });

  it("puts each refusal on the row or slot it is about, and saves nothing", async () => {
    const catalog = await seededMenu();
    await renderSignedIn(<ProductEditorScreen productId={COMBO_ID} isNew />, catalog.api);
    type(await screen.findByLabelText(T.name), "Combo trưa");
    pick(document.body, T.kind, T.kinds.combo);
    type(screen.getByLabelText(T.basePrice), "45.000");
    const slot = slotCard(1);
    type(within(slot).getByLabelText(T.slotName), "Món chính");
    fireEvent.click(screen.getByRole("button", { name: T.save }));
    expect(within(row(slot, 1)).getByText(T.pickProduct)).toBeTruthy();

    pick(row(slot, 1), T.slotProduct, "Bánh croissant");
    fireEvent.click(within(slot).getByRole("button", { name: T.addSlotOption }));
    pick(row(slot, 2), T.slotProduct, "Bánh croissant");
    fireEvent.click(screen.getByRole("button", { name: T.save }));
    // The second of two equal rows is the one to remove.
    const duplicate = messageForCode("DOMAIN_CATALOG_DUPLICATE_COMBO_SLOT_OPTION");
    expect(within(row(slot, 2)).getByText(duplicate)).toBeTruthy();
    expect(within(row(slot, 1)).queryByText(duplicate)).toBeNull();

    fireEvent.click(
      within(row(slot, 2)).getByRole("button", { name: T.removeSlotOption("Bánh croissant") }),
    );
    fireEvent.click(
      within(row(slot, 1)).getByRole("button", { name: T.removeSlotOption("Bánh croissant") }),
    );
    fireEvent.click(screen.getByRole("button", { name: T.save }));
    expect(
      within(slot).getByText(messageForCode("DOMAIN_CATALOG_REQUIRED_COMBO_SLOT_WITHOUT_OPTIONS")),
    ).toBeTruthy();
    expect(catalog.putProduct).not.toHaveBeenCalled();
  });

  it("opens a saved combo with its slots, keeps it a combo, and saves them back unchanged", async () => {
    const catalog = await seededMenu();
    const combo = checkProductDraft({
      ...milkTeaDraft(),
      id: COMBO_ID,
      version: null,
      name: "Combo sáng",
      kind: "combo",
      variants: [],
      modifierGroups: [],
      combo: {
        slots: [
          {
            id: "0190a000-0000-7000-8000-0000000000f5",
            name: "Đồ uống",
            minSelect: "1",
            maxSelect: "1",
            options: [
              { key: "k", productId: TEA.product, variantId: TEA.sizeL, upcharge: "10.000" },
            ],
          },
        ],
      },
    });
    if (!combo.ok) throw new Error("the combo does not check");
    await catalog.putProduct(COMBO_ID, combo.body);
    catalog.putProduct.mockClear();
    await renderSignedIn(<ProductEditorScreen productId={COMBO_ID} isNew={false} />, catalog.api);
    const slot = await screen.findByRole("region", { name: T.slotLabel(1) });
    expect(within(row(slot, 1)).getByRole("combobox", { name: T.slotVariant }).textContent).toBe(
      "L",
    );
    expect(screen.getByText(T.comboKindLocked)).toBeTruthy();
    fireEvent.click(screen.getByRole("combobox", { name: T.kind }));
    const kinds = within(screen.getByRole("listbox", { name: T.kind })).getAllByRole("option");
    expect(kinds.map((option) => option.textContent)).toEqual([T.kinds.combo]);
    fireEvent.click(screen.getByRole("option", { name: T.kinds.combo }));

    fireEvent.click(screen.getByRole("button", { name: T.save }));
    await screen.findByText(T.saved);
    expect(catalog.putProduct.mock.calls[0]?.[1].combo).toEqual(combo.body.combo);
  });
});
