// What a gym owner gives when applying — ONE rule for both doors.
//
// The website form (/platform/apply) and the app's JSON twin (/platform/api/
// apply) used to carry the same checks written out twice, under a comment
// saying duplicated rules would drift. They are here now, once.
//
// CLAUDE.md §40.1 Q2 added two required answers: the owner's phone, with its
// country code, so a reviewer can call them; and the gym's street address, so
// it can be checked against the proof-of-address document.
import { planByKey } from './plans.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A phone number with its country code, as +<digits>, or null.
 *
 * Spaces, dashes, dots and brackets are how people write numbers and are
 * dropped. "00" is the international prefix written out, and becomes "+". A
 * number with no country code is refused rather than guessed: the platform
 * serves gyms worldwide (D-125), so "082…" could be anywhere.
 */
export function normalisePhone(raw) {
  let v = String(raw ?? '').trim().replace(/[\s().-]/g, '');
  if (v.startsWith('00')) v = `+${v.slice(2)}`;
  if (!/^\+\d{7,15}$/.test(v)) return null;
  return v;
}

/**
 * Read an application from a form or a JSON body.
 *
 * @returns {{ input: object, error: string|null }}  `error` is the first
 *   problem, in the order the form asks the questions.
 */
export function readApplication(raw = {}) {
  const text = (v) => String(v ?? '').trim();

  const input = {
    owner_name: text(raw.owner_name),
    email: text(raw.email).toLowerCase(),
    password: raw.password == null ? '' : String(raw.password),
    phone: normalisePhone(raw.phone),
    gym_name: text(raw.gym_name),
    address: text(raw.address),
    city: text(raw.city),
    country: text(raw.country).toUpperCase(),
    estimated_members: Number(raw.estimated_members) || null,
    plan_key: raw.plan,
    needs: text(raw.needs) || null,
    accepted_terms: raw.accept_terms === 'yes' || raw.accept_terms === true,
  };

  const error =
    (!input.owner_name && 'Please give your name.') ||
    (!EMAIL.test(input.email) && 'A valid email is required.') ||
    (input.password.length < 10 && 'Choose a password of at least 10 characters.') ||
    (!input.phone && 'Please give a phone number we can reach you on, with the country code — like +27 82 123 4567.') ||
    (!input.gym_name && 'What is your gym called?') ||
    (!input.address && "Please give the gym's street address.") ||
    (!planByKey(input.plan_key) && 'Please choose a plan.') ||
    // The Gym Owner Agreement, accepted at registration (§41.1 Q5): the
    // website sends "yes" from the tick box, the app sends true.
    (!input.accepted_terms && 'Please read and accept the Gym Owner Agreement.') ||
    null;

  return { input, error };
}
