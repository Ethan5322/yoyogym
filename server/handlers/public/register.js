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
import { faceServiceConfigured, embedEnrolmentImages } from '../../lib/faceservice.js';
import { enrolmentGallery } from '../../lib/facematch.js';
import { insertFaceRow } from '../../lib/facedb.js';
import { computeMembership, addonsTotal, totalDueToday, DURATION_MONTHS } from '../../../shared/pricing.js';
import { currencyForCountry, HOME_COUNTRY } from '../../../shared/countries.js';
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
  if (!(await rateLimit(req, res, { key: 'register', limit: 6, windowMs: 60_000 }))) return;

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

    // ---- identity / locale (Phase — international) ----
    // Nationality drives which ID document was collected; residence drives the
    // display currency. Fall back to the legacy id_type + home country so older
    // clients (and the SA-only flow) keep working unchanged.
    const nationality = /^[A-Za-z]{2}$/.test(a.nationality || '') ? a.nationality.toUpperCase() : null;
    const residenceCountry = /^[A-Za-z]{2}$/.test(a.residence_country || '')
      ? a.residence_country.toUpperCase()
      : null;
    const isHomeNational = nationality ? nationality === HOME_COUNTRY : a.id_type !== 'passport';
    const displayCurrency = currencyForCountry(residenceCountry || nationality || HOME_COUNTRY);

    // ---- insert member ----
    const memberRow = {
      membership_number: membershipNumber,
      verification_code: verificationCode,
      full_name: a.full_name.trim(),
      date_of_birth: a.date_of_birth,
      gender: a.gender || null,
      id_number: isHomeNational ? a.id_number || null : null,
      passport_number: isHomeNational ? null : a.passport_number || null,
      nationality: nationality,
      residence_country: residenceCountry,
      display_currency: displayCurrency,
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
    };
    // Phase 88 — face biometric. A GALLERY of poses is stored (not one averaged
    // template) so a later haircut, beard or makeup change still matches; added
    // only when captured, so registration still works if the biometric columns
    // haven't been migrated yet (the insert retries without them below).
    const faceDescriptors = (Array.isArray(a.face?.descriptors) ? a.face.descriptors : [a.face?.descriptor]).filter(
      (d) => Array.isArray(d) && d.length >= 64
    );
    const faceImages = (Array.isArray(a.face?.images) ? a.face.images : [a.face?.image]).filter(
      (i) => typeof i === 'string' && i.startsWith('data:image')
    );
    if (faceDescriptors.length) {
      memberRow.face_descriptor = faceDescriptors[0];
      memberRow.face_templates = enrolmentGallery(faceDescriptors);
      memberRow.biometric_enrolled = true;
    }
    // ID-card photo: best biometric frame, else the gallery photo the member
    // uploaded when declining the biometric (auto-cropped client-side to the
    // corporate 3:4 portrait). Every card carries a photo either way.
    const idPhoto =
      typeof a.face?.photo === 'string' && a.face.photo.startsWith('data:image') ? a.face.photo : null;
    if (faceImages.length) memberRow.photo_url = faceImages[0];
    else if (idPhoto) memberRow.photo_url = idPhoto;
    // High-accuracy ArcFace embeddings when the InsightFace service is configured.
    if (faceImages.length && faceServiceConfigured()) {
      const embeddings = await embedEnrolmentImages(faceImages);
      if (embeddings.length) {
        memberRow.arcface_embedding = embeddings[0];
        memberRow.arcface_templates = enrolmentGallery(embeddings);
        memberRow.biometric_enrolled = true;
      }
    }
    // insertFaceRow retries without the gallery columns on an un-migrated tenant.
    const { data: member, error: memberErr } = await insertFaceRow(supabase, 'members', memberRow, 'id');
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
        phone: a.phone,
        membership_number: membershipNumber,
        verification_code: verificationCode,
      },
      planName: membership.plan_name,
      tier: membership.tier,
      contractLabel: membership.contract_label,
      amount: dueToday,
      recurring: membership.recurring_amount,
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
      currency: displayCurrency, // member's local currency for the "≈" display hint (charge stays ZAR)
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
