/**
 * Session cookie name, isolated in its own module (no node:crypto) so the Edge
 * middleware can import it without pulling the Node crypto-based auth helpers into
 * the Edge bundle.
 */
export const SESSION_COOKIE = 'promo_session';
