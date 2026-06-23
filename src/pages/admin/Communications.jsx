// Bulk communications (spec 4.12): email a filtered member group via Brevo.
import { useState } from 'react';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';

export default function Communications() {
  const [status, setStatus] = useState('active');
  const [tier, setTier] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setResult('');
    try {
      const r = await apiFetch('/admin/broadcast', {
        method: 'POST',
        body: { filter: { status: status || undefined, tier: tier || undefined }, subject, message },
      });
      setResult(`Sent to ${r.sent} member(s)${r.failed ? `, ${r.failed} failed` : ''}.`);
    } catch (e) {
      setResult(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell>
      <h1 className="text-2xl font-bold uppercase text-body">Communications</h1>
      <p className="mt-1 text-muted">Email a filtered group of members.</p>

      <div className="mt-6 card space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <select className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            {['active', 'expiring', 'lapsed', 'suspended'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="field" value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value="">Any tier</option>
            {['basic', 'standard', 'premium', 'vip'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <input className="field" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <textarea className="field min-h-[140px]" placeholder="Message…" value={message} onChange={(e) => setMessage(e.target.value)} />
        {result && <p className="rounded-lg bg-elevated px-3 py-2 text-sm text-body">{result}</p>}
        <button className="btn-primary w-full" disabled={busy || !subject || !message} onClick={send}>
          {busy ? 'Sending…' : 'Send Email Broadcast'}
        </button>
      </div>
    </AdminShell>
  );
}
