// PIN reset timing and links (spec 2.10, D14).

/** A request waits at most this long for its confirmations. */
export const PIN_RESET_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
/** D14: after approval, the link only works once this wait is over... */
export const PIN_RESET_LINK_WAIT_MS = 24 * 60 * 60 * 1000;
/** ...and then for 30 minutes (spec 2.10). */
export const PIN_RESET_LINK_TTL_MS = 30 * 60 * 1000;
/** The app shows "Annuler la demande" on notifications whose link contains `pin-reset`. */
export const PIN_RESET_OWNER_LINK = '/me/pin-reset';
