"use client";

import { useEffect } from "react";
import { backofficeReporter } from "../../lib/client-errors/reporter-instance";

/** The error pages report the fault React caught, once per fault. */
export function useReportRenderError(error: Error & { digest?: string }) {
  useEffect(() => {
    backofficeReporter().capture({ kind: "render", error });
  }, [error]);
}
