// POST /api/scan  { qr_type }  -> logs a QR code scan (spec 2.1).
// Called by the public landing pages when opened via a QR code (?src=qr).
// Captures device/user-agent/IP for the admin scan analytics.
import { getSupabase } from './_lib/supabase.js';
import { allowMethods, readJsonBody, ok, serverError } from './_lib/http.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  try {
    const { qr_type } = await readJsonBody(req);
    const type = qr_type === 'existing_member' ? 'existing_member' : 'new_member';

    const supabase = getSupabase();
    const ip =
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || null;

    await supabase.from('qr_scan_analytics').insert({
      qr_type: type,
      user_agent: req.headers['user-agent'] || null,
      ip_address: ip,
    });
    return ok(res, { logged: true });
  } catch (err) {
    console.error('scan error:', err.message);
    // Never block the landing page on analytics failure.
    return serverError(res, 'scan log failed');
  }
}
