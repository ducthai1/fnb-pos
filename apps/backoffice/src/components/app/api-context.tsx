"use client";

import { type ReactNode, createContext, useContext, useState } from "react";
import { type BackofficeApi, httpBackofficeApi } from "../../lib/api/backoffice-api";

const ApiContext = createContext<BackofficeApi | null>(null);

/** The API for every screen below; the app passes nothing and gets the real one. */
export function ApiProvider({ api, children }: { api?: BackofficeApi; children: ReactNode }) {
  const [value] = useState<BackofficeApi>(() => api ?? httpBackofficeApi());
  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useApi(): BackofficeApi {
  const api = useContext(ApiContext);
  if (api === null) throw new Error("useApi outside ApiProvider");
  return api;
}
