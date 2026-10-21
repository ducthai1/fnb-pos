/** The API under the POS's own origin (proxied by Vite, or Caddy), unless a build points elsewhere. */
export const API_BASE: string = import.meta.env.VITE_FNB_API_BASE ?? "/api";
