import { useEffect, useState } from "react";
import { photoSource } from "../../features/menu/product-photo-cache";
import { productMark } from "./product-mark";

/** Where a photo stands: none named, on its way, drawn, or failed (the initials stay). */
export type PhotoState = "none" | "loading" | "shown" | "failed";

/** The source to draw for `imageUrl`, and where it stands. */
export function useProductPhoto(imageUrl: string | undefined) {
  const [loaded, setLoaded] = useState<{ for: string; src: string | null } | null>(null);
  useEffect(() => {
    if (imageUrl === undefined) return;
    let current = true;
    photoSource(imageUrl).then(
      (src) => current && setLoaded({ for: imageUrl, src }),
      () => current && setLoaded({ for: imageUrl, src: null }),
    );
    return () => {
      current = false;
    };
  }, [imageUrl]);
  const mine = loaded !== null && loaded.for === imageUrl ? loaded : null;
  const [broken, setBroken] = useState<string | null>(null);
  if (imageUrl === undefined) return { state: "none" as const, src: null, onError() {} };
  if (mine === null) return { state: "loading" as const, src: null, onError() {} };
  if (mine.src === null || broken === mine.src) {
    return { state: "failed" as const, src: null, onError() {} };
  }
  const src = mine.src;
  return { state: "shown" as const, src, onError: () => setBroken(src) };
}

/**
 * A product's mark: its photo, cropped to the mark's shape, or its initials on the
 * category's colour (drawn by CSS from data-initial) when it has none, while the photo is
 * on its way, or when it cannot be loaded or drawn: never a broken image. Decorative: the
 * product's name is always written beside it.
 */
export function ProductMark(props: {
  name: string;
  imageUrl: string | undefined;
  className: string;
}) {
  const photo = useProductPhoto(props.imageUrl);
  return (
    <span
      className={props.className}
      data-initial={productMark(props.name)}
      data-photo={photo.state}
      aria-hidden
    >
      {photo.src === null ? null : (
        <img
          className="pos-photo"
          src={photo.src}
          alt=""
          decoding="async"
          draggable={false}
          onError={photo.onError}
        />
      )}
    </span>
  );
}
