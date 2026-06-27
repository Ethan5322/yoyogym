// Payments & financial management (spec 4.9): list, filter, revenue breakdown,
// manual payment recording, CSV export, refunds.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import { exportCsv } from '../../lib/csv.js';
import { useBranding } from '../../lib/branding.js';
import { downloadReceiptPdf } from '../../lib/receiptPdf.js';

const zar = (n) => 'R' + Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 });
const CATS = ['joining_fee', 'monthly_fee', 'session_pack', 'personal_training', 'class_addon', 'day_pass', 'other'];

export default function PaymentsAdmin() {
  const [sp, setSp] = useSearchParams();
  const toast = useToast();
  const branding = useBranding();
  const [status, setStatus] = useState(sp.get('status') || '');
  const [data, setData] = useState(null);
  const [finance, setFinance] = useState(null);
  const [error, setError] = useState('');
  const [manual, setManual] = useState(false);
  const [reminding, setReminding] = useState(null);

  function load() {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    setSp(status ? { status } : {}, { replace: true });
    apiFetch(`/admin/payments?${p}`).then(setData).catch((e) => setError(e.message));
  }
  useEffect(load, [status]);

  function loadFinance() {
    apiFetch('/admin/finance').then(setFinance).catch(() => {});
  }
  useEffect(loadFinance, []);

  async function remind(m) {
    setReminding(m.member_id);
    try {
      const r = await apiFetch('/admin/finance', { method: 'POST', body: { member_id: m.member_id } });
      toast.success(`Reminder sent to ${m.name} (${zar(r.amount)}).`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setReminding(null);
    }
  }

  function receipt(p) {
    downloadReceiptPdf({
      gymName: branding.name || 'Yoyo GYM',
      accent: branding.accent_color || '#E63946',
      payment: p,
      member: { full_name: p.member_name, membership_number: p.membership_number },
    });
  }

  async function refund(p) {
    if (!confirm(`Mark ${zar(p.amount)} payment from ${p.member_name} as refunded?`)) return;
    try {
      await apiFetch(`/admin/payments?id=${p.id}`, { method: 'PATCH', body: { refunded_amount: p.amount } });
      toast.success(`Refund recorded for ${p.member_name}.`);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  function downloadCsv() {
    if (!data?.payments?.length) return;
    exportCsv(
      `payments-${new Date().toISOString().slice(0, 10)}`,
      ['Date', 'Member', 'Number', 'Category', 'Amount', 'Status', 'Method'],
      data.payments.map((p) => [p.created_at, p.member_name, p.membership_number, p.category, p.amount, p.status, p.method])
    );
  }

  return (
    <AdminShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold uppercase text-body">Payments</h1>
        <div className="flex gap-2">
          <button className="btn-outline px-3 py-1 text-sm" onClick={downloadCsv}>Export CSV</button>
          <button className="btn-primary px-3 py-1 text-sm" onClick={() => setManual(true)}>+ Record Payment</button>
        </div>
      </div>
      {error && <p className="mt-4 text-error">{error}</p>}

      {data && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="card"><div className="text-sm text-muted">Total received</div><div className="font-display text-2xl text-success">{zar(data.total_received)}</div></div>
            {Object.entries(data.breakdown).slice(0, 3).map(([k, v]) => (
              <div key={k} className="card"><div className="text-sm text-muted">{k.replace(/_/g, ' ')}</div><div className="font-display text-2xl text-body">{zar(v)}</div></div>
            ))}
          </div>

          {finance && finance.total > 0 && (
            <div className="card mt-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display uppercase text-body">Outstanding &amp; Aging</h2>
                <span className="font-display text-xl text-error">{zar(finance.total)}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <AgeBucket label="0–30 days" value={finance.buckets.current} />
                <AgeBucket label="31–60 days" value={finance.buckets.d30} tone="warn" />
                <AgeBucket label="61–90 days" value={finance.buckets.d60} tone="warn" />
                <AgeBucket label="90+ days" value={finance.buckets.d90} tone="bad" />
              </div>
              {finance.members.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-muted">
                      <tr><th className="py-2">Member</th><th className="py-2">Owing</th><th className="py-2 hidden sm:table-cell">Oldest</th><th className="py-2"></th></tr>
                    </thead>
                    <tbody>
                      {finance.members.map((m) => (
                        <tr key={m.member_id} className="border-t border-white/5">
                          <td className="py-2 text-body">{m.name} <span className="text-muted">{m.number}</span></td>
                          <td className="py-2 text-error">{zar(m.total)}</td>
                          <td className="py-2 hidden text-muted sm:table-cell">{m.oldest_days}d</td>
                          <td className="py-2 text-right">
                            <button
                              className="text-xs text-accent hover:underline disabled:opacity-40"
                              disabled={!m.has_email || reminding === m.member_id}
                              title={m.has_email ? 'Email a balance reminder' : 'No email on file'}
                              onClick={() => remind(m)}
                            >
                              {reminding === m.member_id ? 'Sending…' : 'Remind'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 flex gap-3">
            <select className="field w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {['received', 'pending', 'failed', 'refunded'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-white/5">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-muted">
                <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Member</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Status</th><th className="px-3 py-2"></th></tr>
              </thead>
              <tbody>
                {!data.payments.length && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-muted">No payments match this filter.</td></tr>
                )}
                {data.payments.map((p) => (
                  <tr key={p.id} className="border-t border-white/5">
                    <td className="px-3 py-2 text-muted">{new Date(p.created_at).toLocaleDateString('en-ZA')}</td>
                    <td className="px-3 py-2 text-body">{p.member_name}</td>
                    <td className="px-3 py-2 text-muted">{p.category}</td>
                    <td className="px-3 py-2 text-body">{zar(p.amount)}</td>
                    <td className="px-3 py-2"><span className="text-accent">{p.status}</span></td>
                    <td className="px-3 py-2 text-right">
                      {p.status === 'received' && (
                        <span className="flex justify-end gap-3">
                          <button className="text-xs text-accent hover:underline" onClick={() => receipt(p)}>Receipt</button>
                          <button className="text-xs text-error hover:underline" onClick={() => refund(p)}>Refund</button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {manual && <ManualPayment onClose={() => { setManual(false); load(); }} />}
    </AdminShell>
  );
}

function AgeBucket({ label, value, tone }) {
  const cls = tone === 'bad' ? 'text-error' : tone === 'warn' ? 'text-yellow-400' : 'text-body';
  return (
    <div className="rounded-lg border border-white/5 bg-surface px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 font-display text-lg ${cls}`}>{zar(value)}</div>
    </div>
  );
}

function ManualPayment({ onClose }) {
  const toast = useToast();
  const [form, setForm] = useState({ amount: '', category: 'monthly_fee', method: 'cash', description: '' });
  const [err, setErr] = useState('');
  async function save() {
    setErr('');
    try {
      await apiFetch('/admin/payments', { method: 'POST', body: { ...form, amount: Number(form.amount) } });
      toast.success(`Payment of ${zar(form.amount)} recorded.`);
      onClose();
    } catch (e) {
      setErr(e.message);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="card w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display uppercase text-body">Record Payment</h2>
        <input className="field" type="number" placeholder="Amount (ZAR)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <select className="field" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {CATS.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
        </select>
        <select className="field" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
          {['cash', 'eft', 'manual'].map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <input className="field" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        {err && <p className="text-sm text-error">{err}</p>}
        <div className="flex gap-3">
          <button className="btn-primary flex-1" onClick={save}>Save</button>
          <button className="btn-outline" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
