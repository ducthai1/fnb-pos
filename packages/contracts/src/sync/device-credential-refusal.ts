/**
 * The code of a 401 that is about the till's own credential (it was revoked, or never was
 * one), as opposed to the 401 about the staff session (API_STAFF_SESSION_INVALID), which
 * only sends the cashier back to the PIN screen. A till that hears this one is no longer
 * paired: nothing it sends will ever be taken again.
 */
export const DEVICE_UNAUTHENTICATED_CODE = "API_DEVICE_UNAUTHENTICATED";
