// Sent with every sync command. The server rejects commands computed by a domain
// version it no longer accepts, so a stale POS cannot record totals the server disagrees with.
export const DOMAIN_VERSION = "0.1.0";
