// Low-level notification channels. Each is env/config-gated and returns
// { ok, error } rather than throwing, so a failed notification never breaks
// the main flow (registration, payment, etc.).
//
//  - Email:    Brevo  (https://api.brevo.com/v3/smtp/email)
//  - WhatsApp: CallMeBot (https://api.callmebot.com/whatsapp.php)
//  - Telegram: CallMeBot (https://api.callmebot.com/text.php)

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

export function emailConfigured() {
  return !!process.env.BREVO_API_KEY;
}

export async function sendEmail({ to, toName, subject, html, sender }) {
  if (!process.env.BREVO_API_KEY) return { ok: false, error: 'brevo_not_configured' };
  try {
    const res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: {
          email: sender?.email || process.env.BREVO_SENDER_EMAIL || 'noreply@example.com',
          name: sender?.name || process.env.BREVO_SENDER_NAME || 'Gym',
        },
        to: [{ email: to, name: toName || to }],
        subject,
        htmlContent: html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `brevo_${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function sendWhatsApp({ phone, apikey, text }) {
  if (!phone || !apikey) return { ok: false, error: 'whatsapp_not_configured' };
  try {
    const url =
      `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}` +
      `&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: `callmebot_wa_${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function sendTelegram({ user, text }) {
  if (!user) return { ok: false, error: 'telegram_not_configured' };
  try {
    const url =
      `https://api.callmebot.com/text.php?user=${encodeURIComponent(user)}` +
      `&text=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: `callmebot_tg_${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
