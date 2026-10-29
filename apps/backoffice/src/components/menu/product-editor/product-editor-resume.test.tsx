import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi } from "../../../messages/vi";
import { refused } from "../../../test-support/fake-backoffice-api";
import { fakeCatalog } from "../../../test-support/fake-catalog";
import { TEA, milkTeaDraft } from "../../../test-support/milk-tea-draft";
import { renderSignedIn } from "../../../test-support/render-signed-in";
import { checkProductDraft } from "./check-product-draft";
import { ProductEditorScreen } from "./product-editor-screen";

const T = vi.menu.editor;

/** A milk tea the shop stopped selling. */
async function archivedTea() {
  const catalog = fakeCatalog();
  const check = checkProductDraft({ ...milkTeaDraft(), version: null });
  if (!check.ok) throw new Error("the milk tea does not check");
  await catalog.putProduct(TEA.product, check.body);
  await catalog.api.archiveProduct?.(TEA.product);
  catalog.putProduct.mockClear();
  return catalog;
}

const open = (catalog: Awaited<ReturnType<typeof archivedTea>>, overrides = {}) =>
  renderSignedIn(<ProductEditorScreen productId={TEA.product} isNew={false} />, { ...catalog.api, ...overrides });

describe("selling an archived product again", () => {
  it("offers the button only on an archived product, and sells it again under its version", async () => {
    const catalog = await archivedTea();
    await open(catalog);
    fireEvent.click(await screen.findByRole("button", { name: T.resume }));
    await screen.findByText(T.resumed);
    expect(catalog.api.resumeProduct).toHaveBeenCalledWith(TEA.product, 2);
    expect(catalog.products.get(TEA.product)?.archivedAt).toBeNull();
    expect(screen.queryByRole("button", { name: T.resume })).toBeNull();
    expect(screen.getByRole("button", { name: T.archive })).toBeTruthy();
  });

  it("is not offered on a product that is selling", async () => {
    const catalog = fakeCatalog();
    const check = checkProductDraft({ ...milkTeaDraft(), version: null });
    if (!check.ok) throw new Error("the milk tea does not check");
    await catalog.putProduct(TEA.product, check.body);
    await open(catalog);
    await screen.findByRole("button", { name: T.archive });
    expect(screen.queryByRole("button", { name: T.resume })).toBeNull();
  });

  it("keeps what was typed, and the next save goes under the new version", async () => {
    const catalog = await archivedTea();
    await open(catalog);
    fireEvent.change(await screen.findByLabelText(T.name), { target: { value: "Trà sữa đổi tên" } });
    fireEvent.click(screen.getByRole("button", { name: T.resume }));
    await screen.findByText(T.resumed);
    expect((screen.getByLabelText(T.name) as HTMLInputElement).value).toBe("Trà sữa đổi tên");
    fireEvent.click(screen.getByRole("button", { name: T.save }));
    await screen.findByText(T.saved);
    expect(catalog.putProduct.mock.calls[0]?.[1]).toMatchObject({ version: 3, name: "Trà sữa đổi tên" });
    expect(catalog.products.get(TEA.product)?.archivedAt).toBeNull();
  });

  it("offers the newer product when someone changed it first", async () => {
    const catalog = await archivedTea();
    await open(catalog);
    await screen.findByRole("button", { name: T.resume });
    catalog.touch(TEA.product);
    fireEvent.click(screen.getByRole("button", { name: T.resume }));
    await screen.findByText(T.conflict);
    expect(catalog.products.get(TEA.product)?.archivedAt).not.toBeNull();
  });

  it("shows why it failed and stays archived", async () => {
    const catalog = await archivedTea();
    await open(catalog, { resumeProduct: async () => refused(404, "API_CATALOG_PRODUCT_NOT_FOUND") });
    fireEvent.click(await screen.findByRole("button", { name: T.resume }));
    await screen.findByText(vi.errors.byCode.API_CATALOG_PRODUCT_NOT_FOUND as string);
    expect(screen.getByRole("button", { name: T.resume })).toBeTruthy();
  });
});
