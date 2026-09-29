// Platform email.
//
// A separate module from server/lib/notify/channels.js for the boundary reason
// (D-081) and for a practical one: these are emails from YOYO GYMS to a gym
// owner, not from a gym to its members. Different sender, different voice,
// different failure consequences.
//
//   >>> IT IS NEVER CONFIGURED IN TESTS, AND MUST DEGRADE, NOT THROW. <<<
//
// A failed email must never undo a decision. Approving a gym provisions a real
// database; losing that because a mail API timed out would be the wrong trade
// by an enormous margin. Every function here reports failure and returns.

import { platformBaseUrl } from './base-url.js';

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

/**
 * Who platform email is FROM, read at send time.
 *
 * Brevo delivers only from a sender it has verified. The old default,
 * no-reply@yoyogyms.com, is on a domain nobody has registered, so with
 * PLATFORM_FROM_EMAIL unset every password-reset and activation email was
 * refused. The gym side's BREVO_SENDER_EMAIL is verified — its emails arrive —
 * so it is the fallback.
 */
export function platformSender(env = process.env) {
  return {
    email: env.PLATFORM_FROM_EMAIL || env.BREVO_SENDER_EMAIL || 'no-reply@yoyogyms.com',
    name: env.PLATFORM_FROM_NAME || 'Yoyo Gyms',
  };
}

/** Read at call time so tests need no environment (D-080). */
export const emailConfigured = () => Boolean(process.env.BREVO_API_KEY);

/**
 * Send one email.
 *
 * @returns {{ok: boolean, reason?: string}} — never throws.
 */
export async function sendEmail({ to, subject, html, text }) {
  if (!emailConfigured()) {
    // Not an error. It means nobody has connected a mail provider yet, and the
    // caller is expected to have a fallback — for activation, the panel shows
    // the link so a human can send it themselves.
    return { ok: false, reason: 'email_not_configured' };
  }
  if (!to) return { ok: false, reason: 'no_recipient' };

  try {
    const res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: platformSender(),
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text || stripTags(html),
      }),
    });

    if (!res.ok) {
      // The body can echo the recipient's address; keep it out of logs.
      return { ok: false, reason: `brevo_${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.message || 'send_failed' };
  }
}

/**
 * The activation email.
 *
 * THE CODE IS IN THE BODY AND THE TOKEN IS IN THE LINK, deliberately kept as
 * two things. The whole point of the second factor is that it is not part of
 * the URL — a link gets forwarded, logged by mail providers and pasted into
 * chats, and the code is what proves the person using it is the person the
 * email was sent to.
 */
export function activationEmail({ gymName, link, code, expiresInHours = 48 }) {
  const safeName = escapeHtml(gymName || 'your gym');

  return {
    subject: `Activate ${gymName || 'your gym'} on Yoyo Gyms`,
    html: `<p>Good news — <b>${safeName}</b> has been approved.</p>
<p>Two steps to finish:</p>
<ol>
  <li><a href="${escapeHtml(link)}">Open your activation page</a></li>
  <li>Enter this code: <b style="font-size:20px;letter-spacing:3px">${escapeHtml(code)}</b></li>
</ol>
<p>Then choose a password, and your gym opens for members straight away.</p>
<p><b>This link expires in ${expiresInHours} hours.</b> If it does, ask us for a new one — we can
send another in a moment.</p>
<p style="color:#666;font-size:12px">If you did not apply to list a gym with us, ignore this
email. Nothing happens until someone uses both the link and the code.</p>`,
    text: `${gymName || 'Your gym'} has been approved.

1. Open: ${link}
2. Enter this code: ${code}

Then choose a password, and your gym opens for members straight away.
This link expires in ${expiresInHours} hours.`,
  };
}

/**
 * The password-reset email.
 *
 * Says what the link does, how long it lasts, and — for the person who did
 * NOT ask — that ignoring it changes nothing. That last line is what stops a
 * reset email from reading as a breach notice.
 */
export function passwordResetEmail({ link, expiresInMinutes = 60 }) {
  return {
    subject: 'Reset your Yoyo Gyms password',
    html: `<p>Someone asked to reset the password for this Yoyo Gyms account.</p>
<p><a href="${escapeHtml(link)}">Choose a new password</a></p>
<p><b>This link works once, for ${expiresInMinutes} minutes.</b> If you own a gym, the new
password also becomes your sign-in for your gym's admin panel.</p>
<p style="color:#666;font-size:12px">If you did not ask for this, ignore this email. Your
password stays as it is unless someone uses this link.</p>`,
    text: `Someone asked to reset the password for this Yoyo Gyms account.

Choose a new password: ${link}

This link works once, for ${expiresInMinutes} minutes. If you own a gym, the new password
also becomes your sign-in for your gym's admin panel.

If you did not ask for this, ignore this email. Your password stays as it is.`,
  };
}

/**
 * "We have your application" — sent the moment an owner applies.
 *
 * Says what happens next and the one thing the owner can do right now:
 * sign in and upload the documents a reviewer needs. Without it the owner's
 * only record was a web page, and nothing told them documents were waiting.
 */
export function applicationReceivedEmail({ gymName, signInUrl }) {
  const safeName = escapeHtml(gymName || 'your gym');
  return {
    subject: `We have your application for ${gymName || 'your gym'}`,
    html: `<p>Thank you — your application to list <b>${safeName}</b> on Yoyo Gyms, with its documents, has arrived.</p>
<p><b>What happens next</b></p>
<ol>
  <li>A person checks your details and each document by hand. It is not instant.</li>
  <li>We email you the decision at this address. If anything is missing we tell you exactly what.</li>
  <li>Once approved, we email you an activation link and a code. Using them opens your gym and your own gym admin panel.</li>
</ol>
<p>You can follow your application at any time: <a href="${escapeHtml(signInUrl)}">sign in</a> with this email and your password.</p>
<p style="color:#666;font-size:12px">If you did not apply, you can ignore this email.</p>`,
    text: `Thank you — your application to list ${gymName || 'your gym'} on Yoyo Gyms, with its documents, has arrived.

What happens next:
1. A person checks your details and each document by hand.
2. We email you the decision at this address.
3. Once approved, we email you an activation link and a code, which open your gym.

Follow your application: ${signInUrl}`,
  };
}

/**
 * An application sent before the documents were in (CLAUDE.md §42.1 Q2): the
 * owner is asked to finish it. Their details are kept; only the documents and
 * the final check are left.
 */
export function finishApplicationEmail({ gymName, signInUrl }) {
  const safeName = escapeHtml(gymName || 'your gym');
  return {
    subject: `Please finish your application for ${gymName || 'your gym'}`,
    html: `<p>Thank you for applying to list <b>${safeName}</b> on Yoyo Gyms.</p>
<p>Your application reached us <b>without its documents</b>, so it has not been reviewed yet. We are sorry —
the upload was not working on our side. It works now, and your details are saved.</p>
<p><b>To finish, it takes a few minutes:</b></p>
<ol>
  <li><a href="${escapeHtml(signInUrl)}">Sign in</a> with this email and the password you chose.</li>
  <li>Upload three documents — a PDF or a clear photo from your phone is fine: <b>your ID</b>,
  <b>your business registration</b> and <b>proof of the gym's address</b>.</li>
  <li>Check what you wrote, and press <b>Submit application</b>.</li>
</ol>
<p>A person then reviews it and we email you the decision.</p>`,
    text: `Thank you for applying to list ${gymName || 'your gym'} on Yoyo Gyms.

Your application reached us without its documents, so it has not been reviewed yet. The upload was not working on our side; it works now, and your details are saved.

To finish:
1. Sign in: ${signInUrl}
2. Upload your ID, your business registration and proof of the gym's address (PDF or a clear photo).
3. Check what you wrote and press Submit application.`,
  };
}

/** A decision email — approved without activation, rejected, or more info wanted. */
export function decisionEmail({ gymName, decision, reason, signInUrl = '' }) {
  const safeName = escapeHtml(gymName || 'your gym');
  const safeReason = escapeHtml(reason || '');
  // Where to act on it: the owner's own page, with their documents.
  const link = signInUrl ? `<p><a href="${escapeHtml(signInUrl)}">Sign in to your owner account</a></p>` : '';
  const linkText = signInUrl ? `\n\nSign in: ${signInUrl}` : '';

  if (decision === 'rejected') {
    return {
      subject: `About your Yoyo Gyms application for ${gymName || 'your gym'}`,
      html: `<p>Thank you for applying to list <b>${safeName}</b>.</p>
<p>We are not able to approve it at the moment.</p>
${safeReason ? `<p><b>Reason:</b> ${safeReason}</p>` : ''}
<p>You are welcome to apply again once that is resolved.</p>
${link}`,
      text: `We are not able to approve ${gymName || 'your gym'} at the moment.${
        reason ? `\n\nReason: ${reason}` : ''
      }\n\nYou are welcome to apply again.${linkText}`,
    };
  }

  return {
    subject: `We need a bit more for ${gymName || 'your gym'}`,
    html: `<p>We are reviewing <b>${safeName}</b> and need something more before we can decide.</p>
${safeReason ? `<p>${safeReason}</p>` : ''}
<p>Sign in and upload it, and we will pick the review back up.</p>
${link}`,
    text: `We need something more before we can decide on ${gymName || 'your gym'}.${
      reason ? `\n\n${reason}` : ''
    }\n\nSign in and upload it, and we will pick the review back up.${linkText}`,
  };
}

/** An invitation to the Yoyo staff team (CLAUDE.md §40.1 Q4). */
export function staffInviteEmail({ name = '', roleLabel = '', link, expiresInHours = 72 }) {
  const safeName = escapeHtml(name);
  const safeRole = escapeHtml(roleLabel);
  return {
    subject: 'You have been invited to the Yoyo Gyms team',
    html: `<p>${safeName ? `Hello ${safeName},` : 'Hello,'}</p>
<p>You have been invited to run Yoyo Gyms${safeRole ? ` as <b>${safeRole}</b>` : ''}.</p>
<p><a href="${escapeHtml(link)}">Set up your account</a></p>
<p>You will choose a password and connect an authenticator app — a code from it is needed every
time you sign in. The link works once and expires in ${expiresInHours} hours.</p>
<p>If you were not expecting this, ignore it and nothing happens.</p>`,
    text: `You have been invited to run Yoyo Gyms${roleLabel ? ` as ${roleLabel}` : ''}.\n\nSet up your account: ${link}\n\nThe link works once and expires in ${expiresInHours} hours. If you were not expecting this, ignore it.`,
  };
}

/** Billing notices, keyed to what the runner already emits. */
export function billingEmail(kind, { gymName = 'your gym', amountCents = null, currency = 'ZAR' } = {}) {
  const money = Number.isFinite(Number(amountCents)) ? `${currency} ${(amountCents / 100).toFixed(2)}` : '';

  const messages = {
    trial_ending: {
      subject: `Your Yoyo Gyms trial ends soon`,
      body: `Your free trial for ${gymName} ends in a few days. Nothing stops working the moment it does — we will take the first payment and carry on.`,
    },
    payment_received: {
      subject: `Payment received — thank you`,
      body: `We have received ${money} for ${gymName}. Nothing else to do.`,
    },
    payment_failed: {
      subject: `We could not take payment for ${gymName}`,
      body: `A payment of ${money} did not go through. <b>Your gym is still open.</b> Please update your card in the next two days so it stays that way.`,
    },
    payment_overdue: {
      subject: `Action needed for ${gymName}`,
      body: `A payment is still outstanding. Your gym is still open, but it will be suspended shortly if we cannot take payment.`,
    },
    gym_suspended: {
      subject: `${gymName} has been suspended`,
      body: `We were not able to take payment, so ${gymName} is suspended and members cannot sign in. <b>No data has been deleted.</b> Paying reopens it immediately.`,
    },
    subscription_ended: {
      subject: `Your Yoyo Gyms subscription has ended`,
      body: `The period you paid for has ended and ${gymName} is now closed to members. <b>Nothing has been deleted.</b> Get in touch whenever you want it back.`,
    },
  };

  const m = messages[kind];
  if (!m) return null;

  return {
    subject: m.subject,
    html: `<p>${m.body}</p><p><a href="${escapeHtml(
      platformBaseUrl()
    )}/platform/my-gym">Open your Yoyo Gyms account</a></p>`,
    text: stripTags(m.body),
  };
}

function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

const stripTags = (html) => String(html ?? '').replace(/<[^>]*>/g, '');
