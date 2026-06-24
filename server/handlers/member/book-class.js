// POST /api/member/book-class  { class_id, session_date }  -> booking
// Enforces tier eligibility and capacity; places the member on the waitlist
// when the class is full (spec 3.3). Idempotent via the unique
// (class_id, member_id, session_date) constraint.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { authenticateMember } from '../../lib/memberauth.js';
import { loadCompliance, rulesFor } from '../../lib/compliance.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  const auth = authenticateMember(req, res);
  if (!auth) return;

  try {
    const { class_id, session_date } = await readJsonBody(req);
    if (!class_id || !session_date) return badRequest(res, 'class_id and session_date are required.');

    const supabase = getSupabase();

    // Member must be active.
    const { data: member } = await supabase
      .from('members')
      .select('status')
      .eq('id', auth.sub)
      .maybeSingle();
    if (!member || member.status !== 'active') {
      return badRequest(res, 'Your membership must be active to book classes.');
    }

    const { data: klass } = await supabase
      .from('classes')
      .select('id, name, max_capacity, allowed_tiers, is_active')
      .eq('id', class_id)
      .maybeSingle();
    if (!klass || !klass.is_active) return badRequest(res, 'Class not available.');

    // Current tier (for eligibility + monthly class limit).
    const { data: membership } = await supabase
      .from('memberships')
      .select('tier')
      .eq('member_id', auth.sub)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Tier eligibility.
    if (klass.allowed_tiers?.length) {
      if (!membership?.tier || !klass.allowed_tiers.includes(membership.tier)) {
        return badRequest(res, 'Your membership tier cannot book this class.');
      }
    }

    // Monthly class limit (compliance engine §C1). -1 = unlimited, 0 = none.
    const config = await loadCompliance(supabase);
    const limit = rulesFor(config, membership?.tier).classes_per_month;
    if (limit != null && limit >= 0) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from('class_bookings')
        .select('id', { count: 'exact', head: true })
        .eq('member_id', auth.sub)
        .in('status', ['booked', 'attended'])
        .gte('booked_at', monthStart.toISOString());
      if ((count || 0) >= limit) {
        return badRequest(
          res,
          limit === 0
            ? 'Your plan does not include group classes. Upgrade to book classes.'
            : `You've reached your plan's limit of ${limit} classes this month.`
        );
      }
    }

    // Already booked?
    const { data: existing } = await supabase
      .from('class_bookings')
      .select('id, status')
      .eq('class_id', class_id)
      .eq('member_id', auth.sub)
      .eq('session_date', session_date)
      .maybeSingle();
    if (existing && existing.status !== 'cancelled') {
      return ok(res, { status: existing.status, message: 'You are already booked for this class.' });
    }

    // Capacity check.
    const { count: bookedCount } = await supabase
      .from('class_bookings')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', class_id)
      .eq('session_date', session_date)
      .eq('status', 'booked');

    const isFull = (bookedCount || 0) >= klass.max_capacity;

    let status = 'booked';
    let waitlist_position = null;
    if (isFull) {
      status = 'waitlisted';
      const { count: waitCount } = await supabase
        .from('class_bookings')
        .select('id', { count: 'exact', head: true })
        .eq('class_id', class_id)
        .eq('session_date', session_date)
        .eq('status', 'waitlisted');
      waitlist_position = (waitCount || 0) + 1;
    }

    const { error } = await supabase.from('class_bookings').upsert(
      {
        class_id,
        member_id: auth.sub,
        session_date,
        status,
        waitlist_position,
        booked_at: new Date().toISOString(),
        cancelled_at: null,
      },
      { onConflict: 'class_id,member_id,session_date' }
    );
    if (error) return serverError(res, error.message);

    return ok(res, {
      status,
      waitlist_position,
      message:
        status === 'booked'
          ? `You're booked for ${klass.name}! See you there. 💪`
          : `${klass.name} is full — you're #${waitlist_position} on the waitlist. We'll notify you if a spot opens.`,
    });
  } catch (err) {
    console.error('book-class error:', err.message);
    return serverError(res, 'Booking failed');
  }
}
