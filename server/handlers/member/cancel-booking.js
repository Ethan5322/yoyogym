// POST /api/member/cancel-booking  { class_id, session_date }  (spec 3.3 / 2.6 #8)
// Cancels a member's booking. Cancellations under 2 hours' notice are flagged as
// late. Frees the slot and auto-promotes the first waitlisted member (notified).
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { authenticateMember } from '../../lib/memberauth.js';
import { notifyMemberEmail } from '../../lib/notify/index.js';
import { notifyAdmin } from '../../lib/inbox.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  const auth = authenticateMember(req, res);
  if (!auth) return;

  try {
    const { class_id, session_date } = await readJsonBody(req);
    if (!class_id || !session_date) return badRequest(res, 'class_id and session_date are required.');

    const supabase = getSupabase();
    const { data: booking } = await supabase
      .from('class_bookings')
      .select('id, status')
      .eq('class_id', class_id)
      .eq('member_id', auth.sub)
      .eq('session_date', session_date)
      .maybeSingle();
    if (!booking || booking.status === 'cancelled') return badRequest(res, 'No active booking found.');

    const { data: klass } = await supabase.from('classes').select('name, start_time').eq('id', class_id).maybeSingle();

    // Late cancellation? (< 2 hours before the session start)
    let late = false;
    if (klass?.start_time) {
      const start = new Date(`${session_date}T${klass.start_time}`);
      late = start.getTime() - Date.now() < 2 * 3600 * 1000 && start.getTime() > Date.now();
    }

    await supabase
      .from('class_bookings')
      .update({ status: late ? 'late_cancelled' : 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', booking.id);

    // confirmation to the member
    const { data: mem } = await supabase.from('members').select('full_name, email, membership_number').eq('id', auth.sub).maybeSingle();

    // Notify management (admin inbox).
    await notifyAdmin(supabase, {
      kind: 'event',
      type: 'class.cancelled',
      title: `${mem?.full_name || 'A member'} cancelled ${klass?.name || 'a class'}${late ? ' (late notice)' : ''}`,
      body: `${session_date}`,
      member_id: auth.sub,
      sender_name: mem ? `${mem.full_name} (${mem.membership_number})` : null,
      sender_role: 'system',
      link: `/admin/members/${auth.sub}`,
    });

    if (mem?.email) {
      await notifyMemberEmail(supabase, { id: auth.sub, full_name: mem.full_name, email: mem.email }, 'booking_cancelled', {
        className: klass?.name || 'your class',
        when: session_date,
        late,
      });
    }

    // promote the first waitlisted member (only if a confirmed seat was freed)
    let promoted = false;
    if (booking.status === 'booked') {
      const { data: next } = await supabase
        .from('class_bookings')
        .select('id, member_id, members(full_name, email)')
        .eq('class_id', class_id)
        .eq('session_date', session_date)
        .eq('status', 'waitlisted')
        .order('waitlist_position', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (next) {
        await supabase.from('class_bookings').update({ status: 'booked', waitlist_position: null }).eq('id', next.id);
        promoted = true;
        if (next.members?.email) {
          await notifyMemberEmail(
            supabase,
            { id: next.member_id, full_name: next.members.full_name, email: next.members.email },
            'waitlist_promoted',
            { className: klass?.name || 'the class', when: session_date }
          );
        }
      }
    }

    return ok(res, {
      cancelled: true,
      late,
      promoted,
      message: late ? 'Booking cancelled (late notice).' : 'Booking cancelled.',
    });
  } catch (err) {
    console.error('cancel-booking error:', err.message);
    return serverError(res, 'Could not cancel booking');
  }
}
