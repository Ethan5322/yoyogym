// Button that generates + downloads the member's corporate ID card (front + back).
import { useState } from 'react';
import { useBranding } from '../lib/branding.js';

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase() : '');
const GENDER = { male: 'Male', female: 'Female', prefer_not_to_say: 'Not disclosed' };

/** The holder details printed on the back of a member's card. */
function identityFields(member) {
  return [
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
}

export default function IdCardButton({ member, className = 'btn-primary w-full' }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const branding = useBranding();

  async function go() {
    setBusy(true);
    setErr('');
    try {
      const { downloadIdCard } = await import('../lib/idcard.js');
      await downloadIdCard({
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
      });
    } catch (e) {
      setErr(e.message || 'Could not generate ID card.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className={className} onClick={go} disabled={busy}>
        {busy ? 'Preparing your ID…' : '⬇ Download My ID Card'}
      </button>
      {err && <p className="mt-1 text-sm text-error">{err}</p>}
    </>
  );
}
