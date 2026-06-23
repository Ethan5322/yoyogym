// Generators for the unique membership number and verification code, with
// collision-checked uniqueness against the database.
import { randomInt } from 'node:crypto';

// Avoids ambiguous characters (0/O, 1/I) for codes people read aloud / type.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(len) {
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_CHARS[randomInt(0, CODE_CHARS.length)];
  return out;
}

/** Membership number format: GYM-YYYY-XXXXXX (6 alphanumeric). */
export async function generateMembershipNumber(supabase) {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = `GYM-${year}-${randomCode(6)}`;
    const { data } = await supabase
      .from('members')
      .select('id')
      .eq('membership_number', candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  throw new Error('Could not generate a unique membership number');
}

/** 8-character uppercase alphanumeric verification code. */
export async function generateVerificationCode(supabase) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = randomCode(8);
    const { data } = await supabase
      .from('members')
      .select('id')
      .eq('verification_code', candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  throw new Error('Could not generate a unique verification code');
}
