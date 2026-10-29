"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { PriceListEditorScreen } from "../../../../../components/menu/price-lists/price-list-editor-screen";

function PriceListEditorPage() {
  const { priceListId } = useParams<{ priceListId: string }>();
  const searchParams = useSearchParams();
  // Read once: dropping the marker after the first save must not reload the editor.
  const [isNew] = useState(() => searchParams.get("new") === "1");
  return (
    <PriceListEditorScreen
      key={priceListId}
      id={priceListId}
      isNew={isNew}
      // history.replaceState keeps the page mounted, so what is on screen stays as saved.
      onSaved={() => window.history.replaceState(null, "", `/menu/price-lists/${priceListId}`)}
    />
  );
}

export default function Page() {
  return (
    <Suspense>
      <PriceListEditorPage />
    </Suspense>
  );
}
