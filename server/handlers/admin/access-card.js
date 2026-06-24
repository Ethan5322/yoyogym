// GET /api/admin/access-card?type=member|trainer&id=...  (Phase 99 §A2/A3)
// Returns the full corporate access card for a scanned person.
// Owner/Manager/Reception.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, ok, badRequest, serverError } from '../../lib/http.js';
import { requireRole } from '../../lib/auth.js';

// preferred_time -> scheduled slot (refined further by the compliance engine, §C)
const SLOTS = {
  early_morning: { start: 5, end: 8, label: '05:00 – 08:00' },
  morning: { start: 8, end: 12, label: '08:00 – 12:00' },
  afternoon: { start: 12, end: 17, label: '12:00 – 17:00' },
  evening: { start: 17, end: 21, label: '17:00 – 21:00' },
  flexible: null,
};
const SESSION_MINUTES = 120; // default allowed session length (configurable later)

const startOfDay = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const startOfMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  if (!requireRole(req, res, ['owner', 'manager', 'reception'])) return;

  const url = new URL(req.url, 'http://localhost');
  const type = url.searchParams.get('type') || 'member';
  const id = url.searchParams.get('id');
  if (!id) return badRequest(res, 'id is required.');

  const supabase = getSupabase();

  try {
    if (type === 'trainer') return await trainerCard(supabase, id, res);
    return await memberCard(supabase, id, res);
  } catch (err) {
    console.error('access-card error:', err.message);
    return serverError(res, 'Could not load access card');
  }
}

async function memberCard(supabase, id, res) {
  const { data: m, error } = await supabase.from('members').select('*').eq('id', id).maybeSingle();
  if (error) return serverError(res, error.message);
  if (!m) return badRequest(res, 'Member not found.');

  const [{ data: membership }, { data: pending }, { data: todayCheckins }, { count: monthVisits }] =
    await Promise.all([
      supabase
        .from('memberships')
        .select('*, plans(name)')
        .eq('member_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('payments').select('amount').eq('member_id', id).in('status', ['pending', 'failed']),
      supabase
        .from('checkins')
        .select('checked_in_at, checked_out_at')
        .eq('member_id', id)
        .gte('checked_in_at', startOfDay().toISOString())
        .order('checked_in_at', { ascending: false }),
      supabase
        .from('checkins')
        .select('id', { count: 'exact', head: true })
        .eq('member_id', id)
        .gte('checked_in_at', startOfMonth().toISOString()),
    ]);

  const outstanding = (pending || []).reduce((s, p) => s + Number(p.amount || 0), 0);
  const openCheckin = (todayCheckins || []).find((c) => !c.checked_out_at);
  const lastCheckin = (todayCheckins || [])[0];

  // time tracking
  let timeInsideMin = null;
  let timeRemainingMin = null;
  let overtimeMin = 0;
  if (openCheckin) {
    timeInsideMin = Math.floor((Date.now() - new Date(openCheckin.checked_in_at)) / 60000);
    const rem = SESSION_MINUTES - timeInsideMin;
    timeRemainingMin = Math.max(0, rem);
    overtimeMin = rem < 0 ? -rem : 0;
  }

  // schedule compliance (basic; §C refines with per-day schedules + plan limits)
  const slot = SLOTS[m.preferred_time];
  const hour = new Date().getHours();
  let banner = 'on_schedule';
  if (m.status === 'suspended') banner = 'violation';
  else if (m.status === 'lapsed') banner = 'violation';
  else if (slot && (hour < slot.start || hour >= slot.end)) banner = 'extra';
  else banner = 'on_schedule';

  // contract
  const today = startOfDay();
  let daysRemaining = null;
  if (membership?.end_date) {
    daysRemaining = Math.max(0, Math.ceil((new Date(membership.end_date) - today) / 86400000));
  }

  return ok(res, {
    type: 'member',
    member: {
      id: m.id,
      full_name: m.full_name,
      membership_number: m.membership_number,
      photo_url: m.photo_url,
      status: m.status,
      phone: m.phone,
      parq_flag: m.parq_flag,
      has_medical_aid: m.has_medical_aid,
      medical_aid_provider: m.medical_aid_provider,
      emergency_name: m.emergency_name,
      emergency_phone: m.emergency_phone,
    },
    membership: membership
      ? {
          tier: membership.tier,
          plan_name: membership.plans?.name || membership.visit_type,
          monthly_amount: Number(membership.monthly_amount || 0),
          contract_duration: membership.contract_duration,
          end_date: membership.end_date,
          days_remaining: daysRemaining,
          next_billing_date: membership.next_billing_date,
          sessions_total: membership.sessions_total,
          sessions_remaining: membership.sessions_remaining,
        }
      : null,
    payment: { up_to_date: outstanding === 0, outstanding },
    today: {
      checked_in_at: lastCheckin?.checked_in_at || null,
      inside: !!openCheckin,
      time_inside_min: timeInsideMin,
      time_remaining_min: timeRemainingMin,
      overtime_min: overtimeMin,
    },
    month: { visits: monthVisits || 0 },
    schedule: { slot_label: slot?.label || 'Flexible', banner, session_minutes: SESSION_MINUTES },
  });
}

async function trainerCard(supabase, id, res) {
  const { data: t, error } = await supabase.from('trainers').select('*').eq('id', id).maybeSingle();
  if (error) return serverError(res, error.message);
  if (!t) return badRequest(res, 'Trainer not found.');

  const todayYmd = new Date().toISOString().slice(0, 10);
  const dow = new Date().getDay();

  const [{ data: classes }, { data: sessions }] = await Promise.all([
    supabase.from('classes').select('name, start_time, recurrence, day_of_week, class_date').eq('trainer_id', id).eq('is_active', true),
    supabase
      .from('training_sessions')
      .select('scheduled_at, completed, members(full_name)')
      .eq('trainer_id', id)
      .gte('scheduled_at', startOfDay().toISOString()),
  ]);

  const todaysClasses = (classes || [])
    .filter((c) => (c.recurrence === 'recurring' ? c.day_of_week === dow : c.class_date === todayYmd))
    .map((c) => ({ name: c.name, start_time: c.start_time }))
    .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

  const clients = (sessions || []).map((s) => ({ name: s.members?.full_name, completed: s.completed }));
  const onShift = todaysClasses.length > 0 || clients.length > 0;

  return ok(res, {
    type: 'trainer',
    trainer: {
      id: t.id,
      full_name: t.full_name,
      photo_url: t.photo_url,
      specialization: t.specialization,
      certifications: t.certifications,
      phone: t.phone,
    },
    today: { classes: todaysClasses, clients },
    shift: { status: onShift ? 'on_shift' : 'off_shift' },
  });
}
