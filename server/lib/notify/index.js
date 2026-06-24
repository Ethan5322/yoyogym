// Notification dispatcher + high-level triggers (spec Part 5 / 2.6).
//
// Reads owner contacts + toggles from settings (with env fallbacks), sends via
// the channel layer, and records every attempt in notifications_log. Every
// function is best-effort: failures are logged, never thrown, so the core flow
// (registration, payment) is never blocked by a notification problem.
import {
  sendEmail,
  sendWhatsApp,
  sendTelegram,
  emailConfigured,
} from './channels.js';
import { memberTemplates, ownerTemplates } from './templates.js';

async function loadConfig(supabase) {
  const { data } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['gym_profile', 'notifications', 'notification_toggles']);
  const map = Object.fromEntries((data || []).map((r) => [r.key, r.value || {}]));
  const n = map.notifications || {};
  return {
    gymName: map.gym_profile?.name || 'Your Gym',
    sender: {
      email: process.env.BREVO_SENDER_EMAIL || n.sender_email,
      name: map.gym_profile?.name || process.env.BREVO_SENDER_NAME,
    },
    owner: {
      email: n.owner_email || process.env.OWNER_EMAIL,
      whatsappPhone: n.owner_whatsapp_phone || process.env.CALLMEBOT_WHATSAPP_PHONE,
      whatsappApiKey: n.owner_whatsapp_apikey || process.env.CALLMEBOT_WHATSAPP_APIKEY,
      telegramUser: n.owner_telegram_user || process.env.CALLMEBOT_TELEGRAM_USERNAME,
    },
    toggles: map.notification_toggles || {},
  };
}

function enabled(toggles, key) {
  return toggles[key] !== false; // default ON
}

async function log(supabase, row) {
  try {
    await supabase.from('notifications_log').insert(row);
  } catch {
    /* logging must never throw */
  }
}

// ---- member email ----
async function emailMember(supabase, cfg, { member, templateKey, vars }) {
  const tpl = memberTemplates[templateKey];
  if (!tpl) return;
  const { subject, html } = tpl({ gymName: cfg.gymName, member, ...vars });
  const result = await sendEmail({
    to: member.email,
    toName: member.full_name,
    subject,
    html,
    sender: cfg.sender,
  });
  await log(supabase, {
    member_id: member.id,
    recipient: member.email,
    channel: 'email',
    template_key: templateKey,
    subject,
    status: result.ok ? 'sent' : 'failed',
    error_message: result.ok ? null : result.error,
    sent_at: result.ok ? new Date().toISOString() : null,
  });
}

// Branded HTML wrapper for owner email alerts (plain text -> tidy email).
function ownerEmailHtml(gymName, text) {
  const body = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
  return `<!doctype html><html><body style="margin:0;background:#080808;font-family:Arial,Helvetica,sans-serif;color:#F0EDE8">
    <div style="max-width:560px;margin:0 auto;padding:24px">
      <h1 style="color:#E63946;letter-spacing:1px;text-transform:uppercase;font-size:20px;margin:0 0 12px">${gymName} — Owner Alert</h1>
      <div style="background:#111;border:1px solid #222;border-left:3px solid #E63946;border-radius:6px;padding:18px;line-height:1.7;font-size:14px">${body}</div>
      <p style="color:#8A8580;font-size:11px;margin-top:14px">Automated notification from your ${gymName} management system.</p>
    </div></body></html>`;
}

// ---- owner multi-channel alert ----
async function alertOwner(supabase, cfg, { templateKey, text, memberId }) {
  const targets = [
    cfg.owner.whatsappPhone && cfg.owner.whatsappApiKey
      ? { channel: 'whatsapp', run: () => sendWhatsApp({ phone: cfg.owner.whatsappPhone, apikey: cfg.owner.whatsappApiKey, text }), recipient: cfg.owner.whatsappPhone }
      : null,
    cfg.owner.telegramUser
      ? { channel: 'telegram', run: () => sendTelegram({ user: cfg.owner.telegramUser, text }), recipient: cfg.owner.telegramUser }
      : null,
    cfg.owner.email && emailConfigured()
      ? {
          channel: 'email',
          run: () =>
            sendEmail({
              to: cfg.owner.email,
              toName: 'Owner',
              subject: `${cfg.gymName} — ${text.split('\n')[0].replace(/^[^A-Za-z]+/, '').trim() || 'Notification'}`,
              html: ownerEmailHtml(cfg.gymName, text),
              sender: cfg.sender,
            }),
          recipient: cfg.owner.email,
        }
      : null,
  ].filter(Boolean);

  for (const t of targets) {
    const result = await t.run();
    await log(supabase, {
      member_id: memberId || null,
      recipient: t.recipient,
      channel: t.channel,
      template_key: templateKey,
      body: text,
      status: result.ok ? 'sent' : 'failed',
      is_owner_alert: true,
      error_message: result.ok ? null : result.error,
      sent_at: result.ok ? new Date().toISOString() : null,
    });
  }
}

// ======================= HIGH-LEVEL TRIGGERS =======================

/** New registration: member welcome + owner alert(s). */
export async function onNewMember(supabase, { member, planName, tier, contractLabel, amount, recurring, parqFlag }) {
  try {
    const cfg = await loadConfig(supabase);
    const vars = { gymName: cfg.gymName, planName, tier, contractLabel, amount, recurring };
    if (enabled(cfg.toggles, 'welcome_email')) {
      await emailMember(supabase, cfg, { member, templateKey: 'welcome', vars });
    }
    if (enabled(cfg.toggles, 'owner_new_member')) {
      await alertOwner(supabase, cfg, {
        templateKey: 'new_member',
        text: ownerTemplates.new_member({ member, planName, tier, contractLabel, amount, recurring, parqFlag }),
        memberId: member.id,
      });
    }
    if (parqFlag && enabled(cfg.toggles, 'owner_parq_flag')) {
      await alertOwner(supabase, cfg, {
        templateKey: 'parq_flag',
        text: ownerTemplates.parq_flag({ member }),
        memberId: member.id,
      });
    }
  } catch (err) {
    console.error('onNewMember notify error:', err.message);
  }
}

/** Low-level: send a single member email by template (used by cron jobs). */
export async function notifyMemberEmail(supabase, member, templateKey, vars = {}) {
  try {
    const cfg = await loadConfig(supabase);
    await emailMember(supabase, cfg, { member, templateKey, vars });
  } catch (err) {
    console.error('notifyMemberEmail error:', err.message);
  }
}

/** Low-level: send an owner alert by template key + text (used by cron jobs). */
export async function notifyOwner(supabase, templateKey, text, memberId = null) {
  try {
    const cfg = await loadConfig(supabase);
    await alertOwner(supabase, cfg, { templateKey, text, memberId });
  } catch (err) {
    console.error('notifyOwner error:', err.message);
  }
}

/** Successful payment: member receipt + owner alert. */
export async function onPaymentReceived(supabase, { member, amount, description, membershipNumber }) {
  try {
    const cfg = await loadConfig(supabase);
    if (enabled(cfg.toggles, 'payment_receipt')) {
      await emailMember(supabase, cfg, {
        member,
        templateKey: 'payment_receipt',
        vars: { amount, description, membershipNumber },
      });
    }
    if (enabled(cfg.toggles, 'owner_payment')) {
      await alertOwner(supabase, cfg, {
        templateKey: 'payment_received',
        text: ownerTemplates.payment_received({ member, amount, description, membershipNumber }),
        memberId: member.id,
      });
    }
  } catch (err) {
    console.error('onPaymentReceived notify error:', err.message);
  }
}
