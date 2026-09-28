// The Yoyo staff team — who may run the main admin panel (CLAUDE.md §40.1 Q4).
//
// Six roles have existed as data since the platform was built (platform/
// seed.sql), and nothing could give one to a person except SQL. This is the
// logic behind the Team page; platform/deps.js does the reading and writing.
//
// THREE RULES THIS FILE EXISTS FOR
//
// 1. An invited person sets their password AND their authenticator from a
//    one-time link — the same first-run setup the platform owner went through
//    (platform/setup.js). Two-factor stays required for staff (D-077).
// 2. Nobody changes their own role or switches themselves off. A slip there
//    is how an owner locks themselves out of their own platform.
// 3. The last active platform owner can never be demoted or switched off.
//    Somebody must always be able to manage the team.
import { createHash, randomBytes } from 'node:crypto';

/** The roles, as seed.sql defines them. Order is the order the Team page offers. */
export const STAFF_ROLES = [
  ['platform_owner', 'Platform owner', 'Everything, including the team, prices and settings.'],
  ['platform_admin', 'Platform admin', 'Day-to-day: applications, gyms, suspensions, audit. No prices or team.'],
  ['reviewer', 'Reviewer', 'Reads applications and documents; approves or rejects.'],
  ['billing', 'Billing', 'Plans, prices, subscriptions and invoices.'],
  ['support', 'Support', 'Looks at gyms and their health. Never member data.'],
  ['read_only', 'Read only', 'Reports and figures, and nothing that changes anything.'],
];

export const roleLabel = (key) => (STAFF_ROLES.find(([k]) => k === key) || [key, key])[1];
export const isRole = (key) => STAFF_ROLES.some(([k]) => k === key);

/** Three days: long enough for a weekend, short enough that a forgotten link dies. */
export const INVITE_TTL_HOURS = 72;

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');
export const inviteLookupHash = sha256;

/**
 * A new invite. The raw token goes in the link and nowhere else; only its hash
 * is stored, so the database never holds a working invitation.
 */
export function issueInvite({ userId, invitedBy = null, now = new Date() }) {
  const token = randomBytes(32).toString('hex');
  return {
    token,
    row: {
      user_id: userId,
      token_hash: sha256(token),
      invited_by: invitedBy,
      expires_at: new Date(now.getTime() + INVITE_TTL_HOURS * 3_600_000).toISOString(),
    },
  };
}

/** One answer for every bad link, so a link cannot be used to probe accounts. */
export const INVITE_REFUSED = 'This invitation link is not valid. Ask for a new one.';

/** Is this invite record usable now? */
export function checkInvite(record, now = new Date()) {
  if (!record || record.used_at) return { ok: false, reason: INVITE_REFUSED };
  if (new Date(record.expires_at).getTime() <= now.getTime()) {
    return { ok: false, reason: 'This invitation has expired. Ask the person who invited you to send a new one.' };
  }
  return { ok: true };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What is wrong with an invitation, or null. */
export function inviteProblem({ email, fullName, role }) {
  if (!String(fullName || '').trim()) return 'Give the person\'s name.';
  if (!EMAIL.test(String(email || '').trim())) return 'Give a valid email address.';
  if (!isRole(role)) return 'Choose a role.';
  return null;
}

/**
 * May `actorId` make this change to `target`?
 *
 * @param {object} args
 * @param {string} args.actorId           who is asking
 * @param {object} args.target            { id, roles: [keys], is_active }
 * @param {'role'|'deactivate'|'reactivate'} args.change
 * @param {string} [args.newRole]         for a role change
 * @param {number} args.activeOwners      active accounts holding platform_owner
 * @returns {string|null} the reason it is refused, or null
 */
export function teamChangeProblem({ actorId, target, change, newRole = null, activeOwners }) {
  if (!target) return 'That person is not on the team.';
  if (target.id === actorId) {
    return 'You cannot change your own role or switch yourself off. Ask another platform owner.';
  }
  if (change === 'role' && !isRole(newRole)) return 'Choose a role.';

  const isOwner = (target.roles || []).includes('platform_owner') && target.is_active !== false;
  const losesOwner = change === 'deactivate' || (change === 'role' && newRole !== 'platform_owner');
  if (isOwner && losesOwner && activeOwners <= 1) {
    return 'This is the last platform owner. Make someone else a platform owner first.';
  }
  return null;
}
