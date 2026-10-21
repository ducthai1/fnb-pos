"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { createContext, useContext, useId, useRef, useState } from "react";
import { photoAddress } from "../../../lib/api/product-image-api";
import { failureMessage } from "../../../lib/errors/failure-message";
import { shrinkPhoto } from "../../../lib/media/shrink-photo";
import { vi } from "../../../messages/vi";
import { useApi } from "../../app/api-context";
import { Icon } from "../../ui/icon";
import type { ProductDraft } from "./product-draft";
import { type DraftEdit, setFields } from "./product-draft-edits";

const T = vi.menuPhoto;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

/** How a picked file becomes the photo sent; tests hand in their own (jsdom has no canvas). */
export const PhotoShrinkContext = createContext<(file: Blob) => Promise<Blob>>(shrinkPhoto);

/**
 * The product's photo: dropped or picked, shrunk in the browser, uploaded at once, then
 * shown as the draft's photo; the product keeps it only when it is saved. Every refusal is
 * written under the field, where the photo was dropped.
 */
export function ProductPhotoField({
  draft,
  edit,
}: {
  draft: ProductDraft;
  edit: (change: DraftEdit) => void;
}) {
  const api = useApi();
  const shrink = useContext(PhotoShrinkContext);
  const input = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function take(file: File | undefined) {
    if (file === undefined) return;
    setError(null);
    if (!ACCEPTED.includes(file.type)) return setError(T.notAPhoto);
    setBusy(true);
    try {
      const sent = await api.uploadProductImage(await shrink(file));
      if (!sent.ok) return setError(failureMessage(sent));
      edit(setFields({ photo: { key: sent.value.imageKey, url: sent.value.imageUrl } }));
    } catch {
      // The browser could not decode or redraw it (a HEIC renamed .jpg, a broken file).
      setError(T.unreadable);
    } finally {
      setBusy(false);
      if (input.current !== null) input.current.value = "";
    }
  }

  const photo = draft.photo;
  return (
    <div
      className="bo-photo-field"
      data-dragging={dragging}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void take(event.dataTransfer.files[0]);
      }}
    >
      <div className="bo-photo-field__frame">
        {photo === null ? (
          <Icon of={ImagePlus} size={28} />
        ) : (
          <img src={photoAddress(photo.url)} alt={T.preview(draft.name.trim())} />
        )}
      </div>
      <div className="bo-photo-field__side">
        <span className="bo-photo-field__label">{T.label}</span>
        <p className="bo-muted">{busy ? T.uploading : T.hint}</p>
        <div className="bo-row">
          <label className="bo-button" aria-disabled={busy}>
            <input
              ref={input}
              type="file"
              accept={ACCEPTED.join(",")}
              className="bo-sr-only"
              disabled={busy}
              aria-describedby={error === null ? undefined : errorId}
              onChange={(event) => void take(event.target.files?.[0])}
            />
            {photo === null ? T.choose : T.change}
          </label>
          {photo === null ? null : (
            <button
              type="button"
              className="bo-button bo-button--quiet"
              disabled={busy}
              onClick={() => edit(setFields({ photo: null }))}
            >
              <Icon of={Trash2} size={16} />
              {T.remove}
            </button>
          )}
        </div>
        {error === null ? null : (
          <p className="bo-field__error" id={errorId} role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
