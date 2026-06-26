// Download actions for a staff/trainer credential:
//  - premium ID card (PNG)
//  - staff: full Staff Employment Agreement PDF (details + T&C + signatures)
//  - trainer: one-page credential PDF
// Uses the gym's live branding (name + accent) so documents are on-brand.
import { useState } from 'react';
import { useBranding } from '../lib/branding.js';

export default function CredentialActions({ person, className = '' }) {
  // person: { kind, id, name, number, verification_code, badge, photo_url,
  //           job_title, phone, email, contract_start, contract_end }
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const branding = useBranding();
  const gymName = branding.name || 'Yoyo GYM';
  const accent = branding.accent_color || '#E63946';

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
        gymName, accent,
        name: person.name,
        membershipNumber: person.number || '',
        roleLabel, subtitle, idLabel,
        badgeText: person.badge || roleLabel,
        validLabel: 'STATUS', validUntil: 'ACTIVE',
        photoUrl: person.photo_url || '',
        qrUrl,
      });
    } catch (e) { setErr(e.message || 'Could not generate ID card.'); } finally { setBusy(''); }
  }

  async function credentialPdf() {
    setBusy('pdf'); setErr('');
    try {
      const { downloadCredentialPdf } = await import('../lib/credentialPdf.js');
      await downloadCredentialPdf({
        gymName, accent, roleLabel, subtitle,
        name: person.name,
        number: person.number || '',
        verificationCode: person.verification_code || '',
        badgeText: person.badge || '',
        photoUrl: person.photo_url || '',
        qrUrl,
      });
    } catch (e) { setErr(e.message || 'Could not generate PDF.'); } finally { setBusy(''); }
  }

  async function contractPdf() {
    setBusy('contract'); setErr('');
    try {
      const { downloadStaffContract } = await import('../lib/staffContractPdf.js');
      await downloadStaffContract({
        gymName, accent,
        employee: {
          name: person.name,
          job_title: person.badge || person.job_title || '',
          staff_number: person.number || '',
          phone: person.phone || '',
          email: person.email || '',
          contract_start: person.contract_start || '',
          contract_end: person.contract_end || '',
        },
      });
    } catch (e) { setErr(e.message || 'Could not generate contract.'); } finally { setBusy(''); }
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        <button className="btn-outline px-3 py-1.5 text-xs" onClick={card} disabled={!!busy}>{busy === 'card' ? '…' : '⬇ ID Card'}</button>
        {person.kind === 'staff' ? (
          <button className="btn-outline px-3 py-1.5 text-xs" onClick={contractPdf} disabled={!!busy}>{busy === 'contract' ? '…' : '⬇ Contract PDF'}</button>
        ) : (
          <button className="btn-outline px-3 py-1.5 text-xs" onClick={credentialPdf} disabled={!!busy}>{busy === 'pdf' ? '…' : '⬇ PDF'}</button>
        )}
      </div>
      {err && <p className="mt-1 text-xs text-error">{err}</p>}
    </div>
  );
}
