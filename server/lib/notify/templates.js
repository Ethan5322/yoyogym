// Notification content templates (spec 2.6 / Part 5). Member emails return
// { subject, html }; owner alerts return a short plain-text string suitable
// for WhatsApp / Telegram and email.
//
// These are the built-in defaults. The admin panel (Phase 7) can later override
// templates via settings; the dispatcher will prefer those when present.

const zar = (n) => 'R' + Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 });

function shell(gymName, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#0A0A0A;font-family:Arial,Helvetica,sans-serif;color:#F5F0E8">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <h1 style="color:#E63946;letter-spacing:1px;text-transform:uppercase;font-size:22px;margin:0 0 16px">${gymName}</h1>
    <div style="background:#141414;border:1px solid #222;border-radius:12px;padding:24px">${bodyHtml}</div>
    <p style="color:#9A9590;font-size:11px;margin-top:16px">This is an automated message from ${gymName}.</p>
  </div></body></html>`;
}

const codeBox = (label, value) =>
  `<div style="margin:16px 0;text-align:center">
     <div style="color:#9A9590;font-size:11px;text-transform:uppercase;letter-spacing:1px">${label}</div>
     <div style="color:#E63946;font-size:28px;font-weight:bold;letter-spacing:4px;font-family:monospace">${value}</div>
   </div>`;

export const memberTemplates = {
  // Sent immediately after registration.
  welcome: ({ gymName, member }) => ({
    subject: `Welcome to ${gymName}! Your membership details`,
    html: shell(
      gymName,
      `<p>Hi ${member.full_name?.split(' ')[0]},</p>
       <p>Welcome to <b>${gymName}</b> — we’re thrilled to have you! 💪 Here are your details:</p>
       ${codeBox('Membership Number', member.membership_number)}
       ${codeBox('Verification Code', member.verification_code)}
       <p style="color:#9A9590;font-size:13px">Show your verification code at reception for first-time access.
       You can download your membership card from the confirmation screen.</p>`
    ),
  }),

  // Sent after a successful payment.
  payment_receipt: ({ gymName, member, amount, description }) => ({
    subject: `${gymName} — Payment received`,
    html: shell(
      gymName,
      `<p>Hi ${member.full_name?.split(' ')[0]},</p>
       <p>We’ve received your payment. Thank you!</p>
       <p style="font-size:18px"><b>${zar(amount)}</b> — ${description || 'Membership payment'}</p>
       <p style="color:#9A9590;font-size:13px">Your membership is now active. See you at the gym!</p>`
    ),
  }),

  // Membership expiring in ~7 days.
  renewal_reminder: ({ gymName, member, endDate }) => ({
    subject: `${gymName} — Your membership is expiring soon`,
    html: shell(
      gymName,
      `<p>Hi ${member.full_name?.split(' ')[0]},</p>
       <p>Your membership expires on <b>${endDate || 'soon'}</b>. Renew now to keep your momentum going! 💪</p>
       <p style="color:#9A9590;font-size:13px">Pop in at reception or reply to this email to renew.</p>`
    ),
  }),

  // Win-back for lapsed members.
  reengagement: ({ gymName, member }) => ({
    subject: `${gymName} — We miss you!`,
    html: shell(
      gymName,
      `<p>Hi ${member.full_name?.split(' ')[0]},</p>
       <p>It’s been a while — your goals are still within reach. Come back and we’ll help you get there. 🏋️</p>
       <p style="color:#9A9590;font-size:13px">Ask us about a returning-member special.</p>`
    ),
  }),

  // Class reminder.
  class_reminder: ({ gymName, member, className, when }) => ({
    subject: `${gymName} — Class reminder: ${className}`,
    html: shell(
      gymName,
      `<p>Hi ${member.full_name?.split(' ')[0]},</p>
       <p>Reminder: you’re booked for <b>${className}</b>${when ? ` (${when})` : ''}. See you there!</p>`
    ),
  }),

  // Account suspended after repeated failed payments.
  suspended: ({ gymName, member }) => ({
    subject: `${gymName} — Membership suspended (payment)`,
    html: shell(
      gymName,
      `<p>Hi ${member.full_name?.split(' ')[0]},</p>
       <p>We were unable to collect your membership payment after multiple attempts, so your access has been temporarily suspended.</p>
       <p style="color:#9A9590;font-size:13px">Please contact reception to settle your balance and reactivate.</p>`
    ),
  }),
};

export const ownerTemplates = {
  new_member: ({ member, planName, amount }) =>
    `🆕 NEW MEMBER: ${member.full_name} joined on ${planName || 'a plan'}` +
    `${amount ? ` · due ${zar(amount)}` : ''} (No. ${member.membership_number}).`,

  parq_flag: ({ member }) =>
    `🩺 MEDICAL FLAG: ${member.full_name} (${member.membership_number}) answered YES on PAR-Q — medical clearance review needed.`,

  payment_received: ({ member, amount, description }) =>
    `💰 PAYMENT: ${member.full_name} paid ${zar(amount)} (${description || 'membership'}).`,

  payment_failed: ({ member, amount }) =>
    `⚠️ PAYMENT FAILED: ${member.full_name} — ${zar(amount)}. A retry has been scheduled.`,

  expiring: ({ member, endDate }) =>
    `⏳ EXPIRING: ${member.full_name} (${member.membership_number}) expires ${endDate}.`,

  lapsed: ({ member }) =>
    `📉 CHURN: ${member.full_name} (${member.membership_number}) has lapsed.`,

  suspended: ({ member }) =>
    `🚫 SUSPENDED: ${member.full_name} (${member.membership_number}) after failed payments.`,

  daily_summary: ({ checkins, revenue, newMembers, classesHeld }) =>
    `📊 DAILY SUMMARY — Check-ins: ${checkins} · Revenue: ${zar(revenue)} · New members: ${newMembers} · Classes: ${classesHeld}.`,

  overtime: ({ member, minutesOver }) =>
    `⏱ OVERTIME: ${member} is ${minutesOver} min over their allowed session time.`,

  capacity_high: ({ inside, capacity, pct }) =>
    `📈 CAPACITY ${pct}%: ${inside}/${capacity} members currently inside.`,

  capacity_urgent: ({ inside, capacity, pct }) =>
    `🚨 CAPACITY ${pct}% (URGENT): ${inside}/${capacity} members inside — near full.`,

  extra_visit: ({ member, reason }) =>
    `🟠 EXTRA VISIT: ${member} checked in (${reason}). Review & approve/deny in the app.`,

  incident: ({ person, note }) =>
    `🚨 INCIDENT logged for ${person}: ${note}`,
};
