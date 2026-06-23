// POST /api/register — creates a new member from the registration chatbot.
//
// SECURITY: the frontend never writes to Supabase. This function:
//  - re-validates core fields server-side
//  - recomputes ALL pricing from the database (never trusts client amounts)
//  - generates the unique membership number + verification code
//  - writes members, memberships, parq_responses, member_addons
//
// Payment (Phase 3) is not collected yet, so the member is created with
// status 'new' (awaiting activation). The membership number + verification
// code are issued now so the success screen + PDF (Phase 4) can use them.
import { getSupabase } from '../../lib/supabase.js';
import { allowMethods, readJsonBody, ok, badRequest, serverError } from '../../lib/http.js';
import { generateMembershipNumber, generateVerificationCode } from '../../lib/identifiers.js';
import { computeMembership, addonsTotal, totalDueToday, DURATION_MONTHS } from '../../../shared/pricing.js';
import { onNewMember } from '../../lib/notify/index.js';
import { rateLimit } from '../../lib/ratelimit.js';

const PARQ_KEYS = [
  'q1_heart_condition',
  'q2_chest_pain_activity',
  'q3_chest_pain_rest',
  'q4_dizziness_balance',
  'q5_bone_joint_problem',
  'q6_bp_heart_meds',
  'q7_other_reason',
];

const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '');
const phoneOk = (v) => /^\+\d{10,15}$/.test((v || '').replace(/[\s-]/g, ''));

function ageFrom(dob) {
  const d = new Date(dob);
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}
function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
const isoDate = (d) => new Date(d).toISOString().slice(0, 10);

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  if (!rateLimit(req, res, { key: 'register', limit: 6, windowMs: 60_000 })) return;

  let createdMemberId = null;
  const supabase = getSupabase();

  try {
    const a = await readJsonBody(req);

    // ---- server-side validation of essentials ----
    if (!a.full_name || a.full_name.trim().split(/\s+/).length < 2)
      return badRequest(res, 'Full name is required.');
    if (!a.date_of_birth || ageFrom(a.date_of_birth) < 16)
      return badRequest(res, 'A valid date of birth (16+) is required.');
    if (!emailOk(a.email)) return badRequest(res, 'A valid email is required.');
    if (!phoneOk(a.phone)) return badRequest(res, 'A valid phone number is required.');
    if (!a.membership || !a.membership.plan_id)
      return badRequest(res, 'A membership selection is required.');
    if (!a.agreement || !a.agreement.indemnity_accepted || !a.agreement.contract_accepted || !a.agreement.signature)
      return badRequest(res, 'Both agreements must be accepted and signed.');

    // ---- recompute pricing from the DB (authoritative) ----
    const { data: plan, error: planErr } = await supabase
      .from('plans')
      .select('*')
      .eq('id', a.membership.plan_id)
      .eq('is_enabled', true)
      .maybeSingle();
    if (planErr) return serverError(res, planErr.message);
    if (!plan) return badRequest(res, 'Selected plan is no longer available.');

    const { data: discSetting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'contract_discounts')
      .maybeSingle();
    const discounts = discSetting?.value && Object.keys(discSetting.value).length ? discSetting.value : undefined;

    const membership = computeMembership(plan, a.membership.contract_duration, discounts);

    // Re-fetch any selected add-ons by id (authoritative prices).
    let addons = [];
    const addonIds = Array.isArray(a.addons) ? a.addons.map((x) => x.id) : [];
    if (addonIds.length) {
      const { data: addonRows, error: addonErr } = await supabase
        .from('addon_services')
        .select('*')
        .in('id', addonIds)
        .eq('is_enabled', true);
      if (addonErr) return serverError(res, addonErr.message);
      addons = (addonRows || []).map((r) => ({
        id: r.id,
        name: r.name,
        price: Number(r.price || 0),
        billing_type: r.billing_type,
        category: r.category,
      }));
    }

    const dueToday = totalDueToday(membership, addons);

    // ---- identifiers ----
    const membershipNumber = await generateMembershipNumber(supabase);
    const verificationCode = await generateVerificationCode(supabase);

    // ---- PAR-Q ----
    const anyYes = PARQ_KEYS.some((k) => a[k] === true);
    const age = ageFrom(a.date_of_birth);

    // ---- insert member ----
    const { data: member, error: memberErr } = await supabase
      .from('members')
      .insert({
        membership_number: membershipNumber,
        verification_code: verificationCode,
        full_name: a.full_name.trim(),
        date_of_birth: a.date_of_birth,
        gender: a.gender || null,
        id_number: a.id_type === 'sa_id' ? a.id_number || null : null,
        passport_number: a.id_type === 'passport' ? a.passport_number || null : null,
        phone: a.phone,
        email: a.email,
        address_street: a.address_street || null,
        address_suburb: a.address_suburb || null,
        address_city: a.address_city || null,
        address_postal_code: a.address_postal_code || null,
        emergency_name: a.emergency_name || null,
        emergency_phone: a.emergency_phone || null,
        guardian_consent: age < 18,
        fitness_goals: a.fitness_goals || [],
        experience_level: a.experience_level || null,
        training_frequency: a.training_frequency || null,
        preferred_time: a.preferred_time || null,
        injuries_notes: a.injuries_notes || null,
        has_medical_aid: !!a.has_medical_aid,
        medical_aid_provider: a.has_medical_aid ? a.medical_aid_provider || null : null,
        status: 'new',
        parq_flag: anyYes,
        manually_registered: !!a.manual,
        popia_consent_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (memberErr) return serverError(res, memberErr.message);
    createdMemberId = member.id;

    // ---- compute membership dates ----
    const today = new Date();
    let endDate = null;
    let nextBilling = null;
    if (membership.visit_type === 'full') {
      const months = DURATION_MONTHS[membership.contract_duration];
      if (months) endDate = isoDate(addMonths(today, months));
      nextBilling = isoDate(addMonths(today, 1));
    } else if (membership.visit_type === 'trial' && plan.trial_days) {
      endDate = isoDate(addDays(today, plan.trial_days));
    } else if (membership.visit_type === 'day_pass') {
      endDate = isoDate(today);
    }

    // ---- insert membership ----
    const { data: membershipRow, error: mErr } = await supabase
      .from('memberships')
      .insert({
        member_id: member.id,
        plan_id: plan.id,
        visit_type: membership.visit_type,
        tier: membership.tier,
        contract_duration: membership.contract_duration,
        state: 'active',
        start_date: isoDate(today),
        end_date: endDate,
        monthly_amount: membership.monthly_amount,
        joining_fee: membership.joining_fee,
        contract_value: membership.contract_value,
        sessions_total: membership.sessions_total,
        sessions_remaining: membership.sessions_total,
        billing_day: membership.visit_type === 'full' ? today.getDate() : null,
        next_billing_date: nextBilling,
        indemnity_accepted_at: a.agreement.accepted_at || new Date().toISOString(),
        contract_accepted_at: a.agreement.accepted_at || new Date().toISOString(),
        digital_signature: a.agreement.signature,
        terms_version: a.agreement.terms_version || null,
      })
      .select('id')
      .single();
    if (mErr) throw new Error('membership: ' + mErr.message);

    // ---- insert PAR-Q ----
    const parqRow = { member_id: member.id, any_yes: anyYes, clearance_required: anyYes };
    for (const k of PARQ_KEYS) parqRow[k] = a[k] === true;
    const { error: pErr } = await supabase.from('parq_responses').insert(parqRow);
    if (pErr) throw new Error('parq: ' + pErr.message);

    // ---- insert add-ons ----
    if (addons.length) {
      const rows = addons.map((ad) => ({
        member_id: member.id,
        membership_id: membershipRow.id,
        addon_id: ad.id,
        price_at_purchase: ad.price,
        billing_type: ad.billing_type,
        is_active: true,
      }));
      const { error: aErr } = await supabase.from('member_addons').insert(rows);
      if (aErr) throw new Error('addons: ' + aErr.message);
    }

    // ---- create the pending "due today" payment (charged in Phase 3) ----
    const PAY_CATEGORY = {
      full: 'joining_fee',
      session_pack: 'session_pack',
      day_pass: 'day_pass',
      trial: 'other',
    };
    if (dueToday > 0) {
      const { error: payErr } = await supabase.from('payments').insert({
        member_id: member.id,
        membership_id: membershipRow.id,
        category: PAY_CATEGORY[membership.visit_type] || 'other',
        amount: dueToday,
        currency: 'ZAR',
        status: 'pending',
        description:
          membership.visit_type === 'full'
            ? 'Joining fee + first month'
            : `${membership.plan_name} payment`,
      });
      if (payErr) throw new Error('payment: ' + payErr.message);
    }

    // ---- notifications: welcome email + owner alerts (best-effort) ----
    await onNewMember(supabase, {
      member: {
        id: member.id,
        full_name: a.full_name.trim(),
        email: a.email,
        membership_number: membershipNumber,
        verification_code: verificationCode,
      },
      planName: membership.plan_name,
      amount: dueToday,
      parqFlag: anyYes,
    });

    return ok(res, {
      member_id: member.id,
      membership_number: membershipNumber,
      verification_code: verificationCode,
      full_name: a.full_name.trim(),
      plan_name: membership.plan_name,
      contract_label: membership.contract_label,
      amount_due_today: dueToday,
      recurring_amount: membership.recurring_amount,
      parq_flag: anyYes,
      start_date: isoDate(today),
    });
  } catch (err) {
    // Best-effort cleanup so a partial failure doesn't orphan a member.
    if (createdMemberId) {
      await supabase.from('members').delete().eq('id', createdMemberId);
    }
    console.error('register error:', err.message);
    return serverError(res, 'Registration could not be completed. Please try again.');
  }
}
