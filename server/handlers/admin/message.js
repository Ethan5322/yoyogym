// POST /api/admin/message  { subject, body }  -> a staff member writes to
// management; lands in the admin inbox. Any authenticated staff role.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';
import { notifyAdmin } from '../../lib/inbox.js';
import { notifyOwner } from '../../lib/notify/index.js';
import { ownerTemplates } from '../../lib/notify/templates.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  const admin = requireRole(req, res, ['owner', 'manager', 'reception', 'trainer']);
  if (!admin) return;

  try {
    const { subject, body } = await readJsonBody(req);
    const text = (body || '').trim();
    if (!text) return badRequest(res, 'Please write a message.');

    const supabase = getSupabase();
    const r = await notifyAdmin(supabase, {
      kind: 'message',
      type: 'staff.message',
      title: (subject || '').trim() || 'Message from staff',
      body: text,
      sender_name: `${admin.full_name || admin.username || 'Staff'} (${admin.role})`,
      sender_role: 'staff',
      direction: 'in',
      link: null,
    });
    if (!r.ok) return serverError(res, 'Could not send your message. Please try again.');

    await notifyOwner(
      supabase,
      'new_message',
      ownerTemplates.new_message({ from: `${admin.full_name || admin.username || 'Staff'} (${admin.role})`, role: 'staff', subject, body: text })
    );
    return ok(res, { sent: true, message: 'Your message has been sent to management.' });
  } catch (err) {
    console.error('admin message error:', err.message);
    return serverError(res, 'Could not send your message.');
  }
}
