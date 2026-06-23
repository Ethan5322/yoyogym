// Field validators for the registration flow. Each returns null when valid,
// or a friendly error string to show the client.

export function required(v, label = 'This field') {
  if (v === null || v === undefined || String(v).trim() === '') return `${label} is required.`;
  return null;
}

export function validateName(v) {
  if (!v || v.trim().split(/\s+/).length < 2) {
    return 'Please enter your full name (first and last name).';
  }
  return null;
}

/** Age in whole years from an ISO date string. */
export function ageFrom(dobStr) {
  const dob = new Date(dobStr);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

export function validateDOB(v) {
  if (!v) return 'Please enter your date of birth.';
  const age = ageFrom(v);
  if (Number.isNaN(age)) return 'Please enter a valid date.';
  if (age < 16) return 'You must be at least 16 years old to register.';
  if (age > 120) return 'Please enter a valid date of birth.';
  return null;
}

/** South African ID: 13 digits + Luhn checksum. */
export function validateSAID(v) {
  const id = (v || '').trim();
  if (!/^\d{13}$/.test(id)) return 'A South African ID number must be exactly 13 digits.';
  let sum = 0;
  let alt = false;
  for (let i = id.length - 1; i >= 0; i--) {
    let d = +id[i];
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  if (sum % 10 !== 0) return 'That ID number doesn’t look valid. Please check and re-enter.';
  return null;
}

export function validatePassport(v) {
  const p = (v || '').trim();
  if (!/^[A-Za-z0-9]{6,12}$/.test(p)) return 'Please enter a valid passport number (6–12 letters/numbers).';
  return null;
}

export function validatePhone(v) {
  const s = (v || '').replace(/[\s-]/g, '');
  if (!/^\+\d{10,15}$/.test(s)) {
    return 'Enter your number with country code, e.g. +27 82 123 4567.';
  }
  return null;
}

export function validateEmail(v) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || '').trim())) {
    return 'Please enter a valid email address.';
  }
  return null;
}

export function validatePostal(v) {
  if (!/^\d{4}$/.test((v || '').trim())) return 'A South African postal code is 4 digits.';
  return null;
}
