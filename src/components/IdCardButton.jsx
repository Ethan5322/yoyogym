// Button that generates + downloads the member's corporate ID card (front + back).
import { useState } from 'react';
import { useBranding } from '../lib/branding.js';
import { countryByCode } from '../../shared/countries.js';

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase() : '');
const GENDER = { male: 'Male', female: 'Female', prefer_not_to_say: 'Not disclosed' };

/** The holder details printed on a member's card (6-slot grid). */
function identityFields(member) {
  const fields = [
    { label: 'Date of Birth', value: fmt(member.date_of_birth) },
    { label: 'Gender', value: GENDER[member.gender] || member.gender || '' },
    // A member has either an SA ID number or a passport number, never both.
    member.id_number
      ? { label: 'ID Number', value: member.id_number }
      : { label: 'Passport No.', value: member.passport_number || '' },
    { label: 'Mobile', value: member.phone || '' },
    { label: 'Emergency Contact', value: member.emergency_name || '' },
    { label: 'Emergency Phone', value: member.emergency_phone || '' },
  ];
  // For non-South-African nationals, nationality is key identity info on the
  // card — show it in place of gender so the grid still fits six fields.
  const nat = countryByCode(member.nationality);
  if (nat && member.nationality !== 'ZA') {
    fields[1] = { label: 'Nationality', value: nat.name };
  }
  return fields;
}

export default function IdCardButton({ member, className = 'btn-primary w-full' }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const branding = useBranding();

  // The card is always built from the member's CURRENT record, so any recent
  // change (tier, photo, details) is reflected the moment it is downloaded.
  function payload() {
    return {
      gymName: branding.name || 'Yoyo GYM',
      accent: branding.accent_color || '#E63946',
      name: member.full_name,
      membershipNumber: member.membership_number,
      tier: member.tier || '',
      validUntil: fmt(member.valid_until) || 'ONGOING',
      photoUrl: member.photo_url || '',
      qrUrl: `${window.location.origin}/p/m/${member.membership_number}`,
      verificationCode: member.verification_code || '',
      fields: identityFields(member),
      issuedOn: fmt(new Date()),
    };
  }

  async function go(kind) {
    setBusy(kind);
    setErr('');
    try {
      const lib = await import('../lib/idcard.js');
      if (kind === 'pdf') await lib.downloadIdCardPdf(payload());
      else await lib.downloadIdCard(payload());
    } catch (e) {
      setErr(e.message || 'Could not generate ID card.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <button className={className} onClick={() => go('png')} disabled={!!busy}>
          {busy === 'png' ? 'Preparing…' : '⬇ ID Card (Image)'}
        </button>
        <button className={className} onClick={() => go('pdf')} disabled={!!busy}>
          {busy === 'pdf' ? 'Preparing…' : '⬇ ID Card (PDF)'}
        </button>
      </div>
      {err && <p className="mt-1 text-sm text-error">{err}</p>}
    </div>
  );
}
