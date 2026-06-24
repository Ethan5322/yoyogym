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
  `<div style="margin:14px 0;text-align:center">
     <div style="color:#9A9590;font-size:11px;text-transform:uppercase;letter-spacing:1px">${label}</div>
     <div style="color:#E63946;font-size:28px;font-weight:bold;letter-spacing:4px;font-family:monospace">${value}</div>
   </div>`;

// Tidy two-column detail rows for emails.
const rows = (pairs) =>
  `<table style="width:100%;border-collapse:collapse;margin:8px 0">${pairs
    .filter(([, v]) => v != null && v !== '')
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;color:#9A9590;font-size:13px">${k}</td>
             <td style="padding:6px 0;text-align:right;color:#F5F0E8;font-size:13px;font-weight:600">${v}</td></tr>`
    )
    .join('')}</table>`;

export const memberTemplates = {
  // Sent immediately after registration — warm, complete welcome.
  welcome: ({ gymName, member, planName, tier, contractLabel, amount, recurring }) => ({
    subject: `Welcome to ${gymName}, ${member.full_name?.split(' ')[0]}! 🎉`,
    html: shell(
      gymName,
      `<p style="font-size:16px">Hi ${member.full_name?.split(' ')[0]},</p>
       <p>Welcome to the <b>${gymName}</b> family — and congratulations on taking this step for your health and fitness! 💪
          We’re thrilled to have you. Your membership is set up and your details are below.</p>
       ${rows([
         ['Full name', member.full_name],
         ['Membership plan', [planName, tier ? `(${tier.toUpperCase()})` : ''].filter(Boolean).join(' ')],
         contractLabel ? ['Contract', contractLabel] : [null, null],
         amount ? ['Paid / due today', zar(amount)] : [null, null],
         recurring ? ['Monthly thereafter', zar(recurring)] : [null, null],
       ])}
       ${codeBox('Membership Number', member.membership_number)}
       ${codeBox('Verification Code', member.verification_code)}
       <p style="color:#9A9590;font-size:13px"><b>What’s next:</b><br>
          1. Show your verification code at reception for your first visit.<br>
          2. Download your membership card &amp; ID from your member portal.<br>
          3. Book your first class or session online any time.</p>
       <p>See you at the gym — let’s get to work! 🏋️<br><b>The ${gymName} Team</b></p>`
    ),
  }),

  // Sent after a successful payment — proper receipt.
  payment_receipt: ({ gymName, member, amount, description, membershipNumber }) => ({
    subject: `${gymName} — Payment receipt (${zar(amount)})`,
    html: shell(
      gymName,
      `<p>Hi ${member.full_name?.split(' ')[0]},</p>
       <p>Thank you — we’ve successfully received your payment. This email is your receipt.</p>
       ${rows([
         ['Description', description || 'Membership payment'],
         ['Amount', zar(amount)],
         ['Date', new Date().toLocaleString('en-ZA')],
         membershipNumber ? ['Membership no.', membershipNumber] : [null, null],
         ['Status', 'PAID ✓'],
       ])}
       <p style="color:#9A9590;font-size:13px">Your membership is active. We appreciate your business — see you at the gym!</p>
       <p><b>The ${gymName} Team</b></p>`
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

  // Class booking confirmation (spec 2.6 #4).
  booking_confirmation: ({ gymName, member, className, when }) => ({
    subject: `${gymName} — Class booked: ${className}`,
    html: shell(
      gymName,
      `<p>Hi ${member.full_name?.split(' ')[0]},</p>
       <p>You’re confirmed for <b>${className}</b>${when ? ` on ${when}` : ''}. We’ll send a reminder before it starts. 💪</p>`
    ),
  }),

  // Class cancelled by the member (spec 2.6 #8).
  booking_cancelled: ({ gymName, member, className, when, late }) => ({
    subject: `${gymName} — Booking cancelled: ${className}`,
    html: shell(
      gymName,
      `<p>Hi ${member.full_name?.split(' ')[0]},</p>
       <p>Your booking for <b>${className}</b>${when ? ` on ${when}` : ''} has been cancelled.</p>
       ${late ? '<p style="color:#FF8C00;font-size:13px">Note: this was a late cancellation (under 2 hours\' notice).</p>' : ''}`
    ),
  }),

  // A waitlisted member promoted into the class.
  waitlist_promoted: ({ gymName, member, className, when }) => ({
    subject: `${gymName} — A spot opened: ${className}`,
    html: shell(
      gymName,
      `<p>Hi ${member.full_name?.split(' ')[0]},</p>
       <p>Good news — a spot opened in <b>${className}</b>${when ? ` on ${when}` : ''} and you’re now booked in. See you there!</p>`
    ),
  }),

  // Session pack running low (spec 2.6 #7).
  session_low: ({ gymName, member, remaining }) => ({
    subject: `${gymName} — ${remaining} session${remaining === 1 ? '' : 's'} left`,
    html: shell(
      gymName,
      `<p>Hi ${member.full_name?.split(' ')[0]},</p>
       <p>You have <b>${remaining}</b> session${remaining === 1 ? '' : 's'} remaining on your pack. Top up to keep training without interruption.</p>`
    ),
  }),

  // Upcoming monthly billing reminder (spec 3.1).
  billing_reminder: ({ gymName, member, amount, date }) => ({
    subject: `${gymName} — Payment due ${date}`,
    html: shell(
      gymName,
      `<p>Hi ${member.full_name?.split(' ')[0]},</p>
       <p>This is a friendly reminder that your membership payment of <b>R${Number(amount || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</b> is scheduled for <b>${date}</b>.</p>`
    ),
  }),
};

export const ownerTemplates = {
  new_member: ({ member, planName, tier, contractLabel, amount, recurring, parqFlag }) =>
    [
      `🆕 NEW MEMBER REGISTERED`,
      ``,
      `Name: ${member.full_name}`,
      `Membership No: ${member.membership_number}`,
      `Plan: ${[planName, tier ? `(${tier.toUpperCase()})` : ''].filter(Boolean).join(' ') || '—'}`,
      contractLabel ? `Contract: ${contractLabel}` : null,
      member.phone ? `Phone: ${member.phone}` : null,
      member.email ? `Email: ${member.email}` : null,
      amount ? `Due today: ${zar(amount)}` : null,
      recurring ? `Monthly: ${zar(recurring)}` : null,
      parqFlag ? `⚠ PAR-Q: medical clearance required` : null,
      `Registered: ${new Date().toLocaleString('en-ZA')}`,
    ]
      .filter((l) => l !== null)
      .join('\n'),

  parq_flag: ({ member }) =>
    [
      `🩺 MEDICAL CLEARANCE REQUIRED`,
      ``,
      `${member.full_name} (${member.membership_number}) answered YES on the PAR-Q health screening.`,
      member.phone ? `Phone: ${member.phone}` : null,
      `Please review and request a doctor's clearance before their first session.`,
    ]
      .filter((l) => l !== null)
      .join('\n'),

  payment_received: ({ member, amount, description, membershipNumber }) =>
    [
      `💰 PAYMENT RECEIVED`,
      ``,
      `Member: ${member.full_name}`,
      membershipNumber ? `Membership No: ${membershipNumber}` : null,
      `Amount: ${zar(amount)}`,
      `For: ${description || 'Membership payment'}`,
      `Date: ${new Date().toLocaleString('en-ZA')}`,
    ]
      .filter((l) => l !== null)
      .join('\n'),

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
