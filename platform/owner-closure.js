// Closing a gym owner's account, finished within 30 days (CLAUDE.md §46.1 Q3;
// both stores require account deletion inside the app, and the owner page is
// reachable there).
//
// The owner asks from their Yoyo Gyms account. Yoyo staff may close it sooner
// ("Close now" on the owner list); on day 30 the nightly job closes it.
// ONE function for both, so they can never do different things.
//
// WHAT CLOSING DOES:
//   · every gym the owner has is suspended — closed to its members and staff;
//   · the confirmation email goes to the address they had, BEFORE it is erased;
//   · the account is switched off, and its personal details erased: name,
//     email, password, authenticator, recovery codes; the phone number on
//     their application too.
// WHAT IT KEEPS: the gym's own data, including the documents sent with the
// application, for the 90 days the owner page promises (D-071: after 90
// suspended days a gym is REPORTED; deleting a gym's data stays a person's
// decision). Audit rows keep their ids, never a name.

export const CLOSURE_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

/** The date an account asked to close at `requestedAt` is closed by. */
export function closeBy(requestedAt) {
  return new Date(new Date(requestedAt || Date.now()).getTime() + CLOSURE_DAYS * DAY);
}

function confirmationEmail(name) {
  const hello = String(name || '').trim().split(/\s+/)[0] || 'there';
  return {
    subject: 'Your Yoyo Gyms account has been closed',
    text:
      `Hi ${hello},\n\nAs you asked, your Yoyo Gyms account has been closed. Your gym is closed to its ` +
      `members and staff, your sign-in is switched off, and your personal details have been erased from ` +
      `your account.\n\nYour gym's data is kept for 90 days in case you change your mind, then deleted. ` +
      `If you did not ask for this, reply to this email.\n\nYoyo Gyms`,
    html:
      `<p>Hi ${hello.replace(/[<>&"]/g, '')},</p><p>As you asked, your Yoyo Gyms account has been closed. ` +
      `Your gym is closed to its members and staff, your sign-in is switched off, and your personal ` +
      `details have been erased from your account.</p><p>Your gym's data is kept for 90 days in case you ` +
      `change your mind, then deleted. If you did not ask for this, reply to this email.</p><p>Yoyo Gyms</p>`,
  };
}

/**
 * Close one owner's account.
 * @param db       the platform database client
 * @param deps     { sendEmail } — platform/email.js, injected for tests
 * @returns {{ ok: boolean, already?: boolean, reason?: string, gymsSuspended?: number, emailed?: boolean }}
 */
export async function closeOwnerAccount(db, userId, { sendEmail = null, now = new Date() } = {}) {
  const { data: user, error } = await db
    .from('platform_users')
    .select('id, email, full_name, kind, closure_completed_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(`Could not read the account: ${error.message}`);
  // Guarded like setOwnerActive: this never touches a Yoyo staff account.
  if (!user || user.kind !== 'gym_owner') return { ok: false, reason: 'not_an_owner' };
  if (user.closure_completed_at) return { ok: true, already: true };

  const at = now.toISOString();

  const { data: gyms, error: gymErr } = await db.from('gyms').select('id, status').eq('owner_user_id', userId);
  if (gymErr) throw new Error(`Could not read the owner's gyms: ${gymErr.message}`);
  let gymsSuspended = 0;
  for (const g of gyms || []) {
    if (g.status === 'suspended') continue;
    const { error: e } = await db.from('gyms').update({ status: 'suspended', suspended_at: at, updated_at: at }).eq('id', g.id);
    if (e) throw new Error(`Could not close the gym: ${e.message}`);
    gymsSuspended += 1;
  }

  let emailed = false;
  if (sendEmail && user.email) {
    const result = await sendEmail({ to: user.email, ...confirmationEmail(user.full_name) });
    emailed = Boolean(result?.ok);
  }

  const { error: upErr } = await db
    .from('platform_users')
    .update({
      is_active: false,
      full_name: 'Closed account',
      // The column is unique and required: an address that can never receive mail.
      email: `closed-${user.id}@closed.invalid`,
      password_hash: null,
      totp_secret: null,
      totp_enabled: false,
      recovery_code_hashes: [],
      closure_completed_at: at,
      updated_at: at,
    })
    .eq('id', userId)
    .eq('kind', 'gym_owner');
  if (upErr) throw new Error(`Could not close the account: ${upErr.message}`);

  await db.from('gym_applications').update({ owner_phone: null }).eq('applicant_user_id', userId);

  return { ok: true, gymsSuspended, emailed };
}

/** Every account that asked 30 days ago and is not closed yet (the nightly job). */
export async function closeDueAccounts(db, { sendEmail = null, now = new Date() } = {}) {
  const cutoff = new Date(now.getTime() - CLOSURE_DAYS * DAY).toISOString();
  const { data: due, error } = await db
    .from('platform_users')
    .select('id')
    .eq('kind', 'gym_owner')
    .lte('closure_requested_at', cutoff)
    .is('closure_completed_at', null)
    .limit(100);
  if (error) return { ok: false, error: error.message };
  const closed = [];
  for (const u of due || []) {
    const r = await closeOwnerAccount(db, u.id, { sendEmail, now });
    if (r.ok && !r.already) closed.push(u.id);
  }
  return { ok: true, due: (due || []).length, closed };
}
