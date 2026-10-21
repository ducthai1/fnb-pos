import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi as mock } from "vitest";
import type { ApiResult } from "../../../lib/api/api-result";
import { messageForCode } from "../../../lib/errors/failure-message";
import { vi } from "../../../messages/vi";
import { refused } from "../../../test-support/fake-backoffice-api";
import { FAKE_TENANT, fakeCatalog } from "../../../test-support/fake-catalog";
import { TEA, milkTeaDraft } from "../../../test-support/milk-tea-draft";
import { renderSignedIn } from "../../../test-support/render-signed-in";
import { checkProductDraft } from "./check-product-draft";
import { ProductEditorScreen } from "./product-editor-screen";
import { PhotoShrinkContext } from "./product-photo-field";

const T = vi.menuPhoto;
const E = vi.menu.editor;
const KEY = `${"ab".repeat(32)}.webp`;
const URL = `/media/product-images/${FAKE_TENANT}/${KEY}`;
const SHRUNK = new Blob(["small webp"], { type: "image/webp" });
const photoFile = (type = "image/jpeg") => new File(["a 12 MB photo"], "IMG_0001.jpg", { type });

type Upload = (
  photo: Blob,
) => Promise<ApiResult<{ imageKey: string; imageUrl: string; width: number; height: number }>>;

async function editTea(upload: Upload, shrink = mock.fn<(file: Blob) => Promise<Blob>>(async () => SHRUNK)) {
  const catalog = fakeCatalog();
  const check = checkProductDraft({ ...milkTeaDraft(), version: null });
  if (!check.ok) throw new Error("the milk tea does not check");
  await catalog.putProduct(TEA.product, check.body);
  catalog.putProduct.mockClear();
  const uploadProductImage = mock.fn(upload);
  await renderSignedIn(
    <PhotoShrinkContext.Provider value={shrink}>
      <ProductEditorScreen productId={TEA.product} isNew={false} />
    </PhotoShrinkContext.Provider>,
    { ...catalog.api, uploadProductImage },
  );
  const field = (await screen.findByText(T.label)).closest<HTMLElement>(".bo-photo-field")!;
  const pick = (file: File) =>
    fireEvent.change(within(field).getByLabelText(T.choose), { target: { files: [file] } });
  return { catalog, uploadProductImage, shrink, field, pick };
}

const stored = async () => ({
  ok: true as const,
  value: { imageKey: KEY, imageUrl: URL, width: 800, height: 600 },
});

describe("the product photo field", () => {
  it("shrinks a picked photo, sends what the shrinking made, and saves its name with the product", async () => {
    const { catalog, uploadProductImage, shrink, field, pick } = await editTea(stored);
    const file = photoFile();
    pick(file);
    const preview = await within(field).findByRole("img", { name: T.preview("Trà sữa trân châu") });
    expect(preview.getAttribute("src")).toBe(`/api${URL}`);
    expect(shrink).toHaveBeenCalledWith(file);
    expect(uploadProductImage).toHaveBeenCalledWith(SHRUNK);
    fireEvent.click(screen.getByRole("button", { name: E.save }));
    await screen.findByText(E.saved);
    expect(catalog.putProduct.mock.calls[0]?.[1]).toMatchObject({ imageKey: KEY });
    expect(catalog.products.get(TEA.product)?.imageUrl).toBe(URL);
  });

  it("takes a photo dropped on the field the same way", async () => {
    const { uploadProductImage, field } = await editTea(stored);
    fireEvent.drop(field, { dataTransfer: { files: [photoFile("image/webp")] } });
    await within(field).findByRole("img");
    expect(uploadProductImage).toHaveBeenCalledWith(SHRUNK);
  });

  it("refuses a file that is not a photo before shrinking or sending, saying so under the field", async () => {
    const { uploadProductImage, shrink, field, pick } = await editTea(stored);
    pick(photoFile("image/svg+xml"));
    expect((await within(field).findByRole("alert")).textContent).toBe(T.notAPhoto);
    expect(shrink).not.toHaveBeenCalled();
    expect(uploadProductImage).not.toHaveBeenCalled();
    expect(within(field).queryByRole("img")).toBeNull();
  });

  it("writes the server's refusal under the field and keeps the product without a photo", async () => {
    const { field, pick } = await editTea(async () => refused(413, "API_MEDIA_TOO_LARGE"));
    pick(photoFile());
    expect((await within(field).findByRole("alert")).textContent).toBe(
      messageForCode("API_MEDIA_TOO_LARGE"),
    );
    expect(within(field).queryByRole("img")).toBeNull();
    // The page's own notice stays clear: the refusal belongs to the photo only.
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("says a file the browser cannot read is unreadable", async () => {
    const { uploadProductImage, field, pick } = await editTea(
      stored,
      mock.fn(async () => Promise.reject(new Error("decode"))),
    );
    pick(photoFile("image/png"));
    expect((await within(field).findByRole("alert")).textContent).toBe(T.unreadable);
    expect(uploadProductImage).not.toHaveBeenCalled();
  });

  it("removes the photo, and the save takes it off the product", async () => {
    const { catalog, field, pick } = await editTea(stored);
    pick(photoFile());
    await within(field).findByRole("img");
    fireEvent.click(screen.getByRole("button", { name: E.save }));
    await screen.findByText(E.saved);
    fireEvent.click(within(field).getByRole("button", { name: T.remove }));
    expect(within(field).queryByRole("img")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: E.save }));
    await mock.waitFor(() => expect(catalog.putProduct).toHaveBeenCalledTimes(2));
    expect(catalog.putProduct.mock.calls[1]?.[1]).toMatchObject({ imageKey: null });
    expect(catalog.products.get(TEA.product)?.imageKey).toBeNull();
  });
});
