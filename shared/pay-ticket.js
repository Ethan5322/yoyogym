// "Pay now" from a gym's admin panel (CLAUDE.md §48).
//
// The owner is signed in to their GYM there, not to their Yoyo account, and
// the payment is started by the platform — two sides that may not import each
// other (D-081). So the gym's server, having checked that this is the gym's
// owner, hands the page a TICKET: the gym's registry id, signed, good for five
// minutes. The page posts it to /platform/pay/start, and the platform starts
// the payment for that gym and nothing else.
//
// What a ticket can do is small on purpose: open the payment page for its own
// gym, at the price the plan says. It names no amount, signs nobody in, and is
// posted in a form body, never put in a URL.
//
// Server-side only (node:crypto). Pages never import this file.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const PAY_TICKET_MINUTES = 5;

// Kept apart from every other signature made with the same key: a session
// token signed with it can never be read as a ticket, nor a ticket as one.
const PURPOSE = 'yoyo-gyms/pay-ticket/v1';

/** The platform's own signing key, read the way the platform reads it. */
export function payTicketKey(env = process.env) {
  return env.PLATFORM_JWT_SECRET || env.JWT_SECRET || '';
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64url');
const mac = (body, key) => createHmac('sha256', key).update(`${PURPOSE}.${body}`).digest('base64url');

/** A ticket for this gym, valid for PAY_TICKET_MINUTES. */
export function signPayTicket({ gymId, slug = '' }, key, now = Date.now()) {
  if (!key) throw new Error('No key to sign a payment ticket with.');
  if (!gymId) throw new Error('A payment ticket needs a gym.');
  const body = b64(JSON.stringify({ g: String(gymId), s: String(slug || ''), e: now + PAY_TICKET_MINUTES * 60_000 }));
  return `${body}.${mac(body, key)}`;
}

/** { gymId, slug } from a genuine, unexpired ticket — otherwise null. */
export function readPayTicket(ticket, key, now = Date.now()) {
  if (!key || typeof ticket !== 'string' || ticket.length > 1024) return null;
  const [body, sig, extra] = ticket.split('.');
  if (!body || !sig || extra !== undefined) return null;

  const want = Buffer.from(mac(body, key));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;

  let claims;
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!claims || typeof claims.g !== 'string' || !claims.g || !Number.isFinite(claims.e) || claims.e <= now) return null;
  return { gymId: claims.g, slug: typeof claims.s === 'string' ? claims.s : '' };
}
