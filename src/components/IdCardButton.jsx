// Button that generates + downloads the member's corporate ID card.
import { useState } from 'react';

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase() : 'ONGOING');

export default function IdCardButton({ member, className = 'btn-primary w-full' }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function go() {
    setBusy(true);
    setErr('');
    try {
      const { downloadIdCard } = await import('../lib/idcard.js');
      await downloadIdCard({
        name: member.full_name,
        membershipNumber: member.membership_number,
        tier: member.tier || '',
        validUntil: fmt(member.valid_until),
        photoUrl: member.photo_url || '',
        qrUrl: `${window.location.origin}/p/m/${member.membership_number}`,
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
