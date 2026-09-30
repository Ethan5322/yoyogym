// Erasing a member's account (CLAUDE.md §46.1 Q3; POPIA's right to erasure).
//
// ONE function for both ways it happens — the owner pressing "Delete member"
// and the morning job on day 30 — so the two can never erase different things.
//
// WHAT GOES: the member's row, and with it (the database's cascades) their
// memberships, health answers, add-ons, check-ins, bookings, training
// sessions, progress, pauses, rewards, challenges and family links; their
// messages to the gym; and the log of messages sent to them, which held their
// email and phone after the member was gone. The platform's "which gym did I
// join?" pointer goes too.
//
// WHAT STAYS: payments, which the law requires a business to keep — with the
// link to the person removed (a payment row carries no name of its own), and
// safety records (visitors, incidents), unlinked by the database itself.
import { unindexMember } from './member-index.js';
import { currentGym } from './tenancy.js';
import { emailErasureConfirmation } from './notify/index.js';

/** Days between a member asking and the morning job erasing (§46.1 Q3). */
export const DELETION_DAYS = 30;

/** The date a request made at `requestedAt` is erased by. */
export function deleteBy(requestedAt) {
  const t = new Date(requestedAt || Date.now()).getTime();
  return new Date(t + DELETION_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Erase one member. `confirm` sends the "your account has been deleted" email
 * to the address they had — read BEFORE the row goes: true always, 'if-asked'
 * only to a member who asked for the deletion themselves.
 * @returns {{ ok: boolean, notFound?: boolean, error?: object, index_cleared?: boolean, reason?: string, emailed?: boolean }}
 */
export async function eraseMember(supabase, id, { confirm = false } = {}) {
  const { data: member, error: readErr } = await supabase
    .from('members')
    .select('id, full_name, email, membership_number, phone, data_deletion_requested')
    .eq('id', id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr };
  if (!member) return { ok: false, notFound: true };

  // Payments stay, without the person (they used to cascade away with them).
  const kept = await supabase.from('payments').update({ member_id: null }).eq('member_id', id);
  if (kept.error) return { ok: false, error: kept.error };

  // Their own words, and their contact details wherever else they were written.
  for (const table of ['notifications_log', 'admin_inbox']) {
    const { error } = await supabase.from(table).delete().eq('member_id', id);
    if (error) return { ok: false, error };
  }

  const { error } = await supabase.from('members').delete().eq('id', id);
  if (error) return { ok: false, error };

  const unfiled = await unindexMember({
    membershipNumber: member.membership_number,
    phone: member.phone,
    gymSlug: currentGym()?.gym?.slug ?? null,
  });

  const wanted = confirm === true || (confirm === 'if-asked' && member.data_deletion_requested === true);
  const emailed =
    wanted && member.email ? await emailErasureConfirmation(supabase, { email: member.email, fullName: member.full_name }) : false;

  return { ok: true, index_cleared: unfiled.ok, reason: unfiled.reason, emailed };
}
