/**
 * Sign-in and sign-up are route handlers that redirect to WorkOS, not pages.
 * Link to them with a plain <a>: next/link would prefetch them, and each
 * prefetch would start a sign-in.
 */
export const SIGN_IN_PATH = "/sign-in";
export const SIGN_UP_PATH = "/sign-up";
