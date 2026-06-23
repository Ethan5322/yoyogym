// Member verification — the main daily-use screen (spec 4.3). Large input for
// a verification code or membership number (works with barcode/QR scanners,
// which type + Enter). Green = access granted, red = denied with reason only.
import { useState, useRef, useEffect } from 'react';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';

const DENY_REASON = {
  not_found: 'Member not found',
  suspended: 'Membership suspended',
  expired: 'Membership expired',
  payment_pending: 'Payment pending — not yet activated',
};

export default function VerifyScreen() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => inputRef.current?.focus(), []);

  async function verify(e) {
    e?.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    try {
      const r = await apiFetch('/admin/verify', { method: 'POST', body: { code } });
      setResult(r);
    } catch (err) {
      setResult({ granted: false, reason: 'not_found', error: err.message });
    } finally {
      setBusy(false);
      setCode('');
      inputRef.current?.focus();
    }
  }

  return (
    <AdminShell>
      <h1 className="text-2xl font-bold uppercase text-body">Member Verification</h1>
      <form onSubmit={verify} className="mt-4 flex gap-3">
        <input
          ref={inputRef}
          className="field flex-1 text-lg"
          placeholder="Scan or type code / membership number"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
        />
        <button className="btn-primary" disabled={busy}>
          {busy ? '…' : 'Verify'}
        </button>
      </form>

      {result && (
        <div className={`mt-6 rounded-2xl p-6 ${result.granted ? 'bg-success/10' : 'bg-error/10'}`}>
          {result.granted ? (
            <>
              <div className="font-display text-2xl uppercase text-success">✓ Access Granted</div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Field label="Name" value={result.member.full_name} />
                <Field label="Membership No." value={result.member.membership_number} />
                <Field label="Tier / Plan" value={result.member.plan_name || result.member.tier || '—'} />
                <Field label="Valid Until" value={result.member.valid_until || 'Ongoing'} />
                <Field
                  label="Payment"
                  value={result.member.payment_ok ? 'Up to date' : `Owes R${result.member.outstanding_balance.toFixed(2)}`}
                />
                {result.member.sessions_remaining != null && (
                  <Field label="Sessions Left" value={result.member.sessions_remaining} />
                )}
              </div>
              {result.member.parq_flag && (
                <p className="mt-4 rounded-lg bg-error/10 px-3 py-2 text-sm text-error">
                  ⚠ Medical clearance required — check for doctor’s note.
                </p>
              )}
              <p className="mt-4 text-sm text-muted">Check-in logged automatically.</p>
            </>
          ) : (
            <>
              <div className="font-display text-2xl uppercase text-error">✕ Access Denied</div>
              <p className="mt-2 text-body">{DENY_REASON[result.reason] || 'Not valid'}</p>
              <p className="mt-2 text-sm text-muted">Please direct the member to reception.</p>
            </>
          )}
        </div>
      )}
    </AdminShell>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="text-body">{value}</div>
    </div>
  );
}
