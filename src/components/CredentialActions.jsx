// Download buttons for a staff/trainer corporate credential: premium ID card
// (PNG) + one-page PDF, both with photo, number, verification code and verify QR.
import { useState } from 'react';

export default function CredentialActions({ person, className = '' }) {
  // person: { kind:'staff'|'trainer', id, name, number, verification_code, badge, photo_url }
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const isTrainer = person.kind === 'trainer';
  const roleLabel = isTrainer ? 'TRAINER' : 'STAFF';
  const subtitle = isTrainer ? 'OFFICIAL TRAINER ID' : 'OFFICIAL STAFF ID';
  const idLabel = isTrainer ? 'TRAINER NO.' : 'STAFF NO.';
  const qrUrl = `${window.location.origin}/p/${isTrainer ? 't' : 's'}/${person.id}`;

  async function card() {
    setBusy('card'); setErr('');
    try {
      const { downloadIdCard } = await import('../lib/idcard.js');
      await downloadIdCard({
        name: person.name,
        membershipNumber: person.number || '',
        roleLabel,
        subtitle,
        idLabel,
        badgeText: person.badge || roleLabel,
        validLabel: 'STATUS',
        validUntil: 'ACTIVE',
        photoUrl: person.photo_url || '',
        qrUrl,
      });
    } catch (e) { setErr(e.message || 'Could not generate ID card.'); } finally { setBusy(''); }
  }

  async function pdf() {
    setBusy('pdf'); setErr('');
    try {
      const { downloadCredentialPdf } = await import('../lib/credentialPdf.js');
      await downloadCredentialPdf({
        roleLabel,
        subtitle,
        name: person.name,
        number: person.number || '',
        verificationCode: person.verification_code || '',
        badgeText: person.badge || '',
        photoUrl: person.photo_url || '',
        qrUrl,
      });
    } catch (e) { setErr(e.message || 'Could not generate PDF.'); } finally { setBusy(''); }
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        <button className="btn-outline px-3 py-1.5 text-xs" onClick={card} disabled={!!busy}>{busy === 'card' ? '…' : '⬇ ID Card'}</button>
        <button className="btn-outline px-3 py-1.5 text-xs" onClick={pdf} disabled={!!busy}>{busy === 'pdf' ? '…' : '⬇ PDF'}</button>
      </div>
      {err && <p className="mt-1 text-xs text-error">{err}</p>}
    </div>
  );
}
