"use client";

import { useState } from "react";
import { photoAddress } from "../../lib/api/product-image-api";
import { nameMark } from "../../lib/format/name-mark";

/** A product's square in the list: its photo over its initials, the initials alone if the photo fails. */
export function ProductListPhoto({ name, imageUrl }: { name: string; imageUrl: string | null | undefined }) {
  const [broken, setBroken] = useState<string | null>(null);
  const shown = imageUrl !== null && imageUrl !== undefined && broken !== imageUrl;
  return (
    <span className="bo-mark" data-initial={nameMark(name)} aria-hidden="true">
      {shown ? <img src={photoAddress(imageUrl)} alt="" loading="lazy" onError={() => setBroken(imageUrl)} /> : null}
    </span>
  );
}
