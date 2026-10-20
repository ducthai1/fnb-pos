"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ProductEditorScreen } from "../../../../../components/menu/product-editor/product-editor-screen";

function ProductEditorPage() {
  const { productId } = useParams<{ productId: string }>();
  const searchParams = useSearchParams();
  // Read once: dropping the marker after the first save must not reload the editor.
  const [isNew] = useState(() => searchParams.get("new") === "1");
  return (
    <ProductEditorScreen
      key={productId}
      productId={productId}
      isNew={isNew}
      // The product exists now; history.replaceState keeps the page mounted, unlike a
      // router navigation, so what is on screen stays as saved.
      onSaved={() => window.history.replaceState(null, "", `/menu/products/${productId}`)}
    />
  );
}

export default function Page() {
  return (
    <Suspense>
      <ProductEditorPage />
    </Suspense>
  );
}
