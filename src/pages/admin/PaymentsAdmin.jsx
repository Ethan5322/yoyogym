// Payments & financial management (spec 4.9): list, filter, revenue breakdown,
// manual payment recording, CSV export, refunds.
import { useEffect, useState } from 'react';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';

const zar = (n) => 'R' + Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 });
const CATS = ['joining_fee', 'monthly_fee', 'session_pack', 'personal_training', 'class_addon', 'day_pass', 'other'];

export default function PaymentsAdmin() {
  const [status, setStatus] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [manual, setManual] = useState(false);

  function load() {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    apiFetch(`/admin/payments?${p}`).then(setData).catch((e) => setError(e.message));
  }
  useEffect(load, [status]);

  async function refund(p) {
    if (!confirm(`Mark ${zar(p.amount)} payment from ${p.member_name} as refunded?`)) return;
    try {
      await apiFetch(`/admin/payments?id=${p.id}`, { method: 'PATCH', body: { refunded_amount: p.amount } });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  function exportCsv() {
    if (!data) return;
    const rows = [['Date', 'Member', 'Number', 'Category', 'Amount', 'Status', 'Method']];
    for (const p of data.payments) {
      rows.push([p.created_at, p.member_name, p.membership_number, p.category, p.amount, p.status, p.method]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'payments.csv';
    a.click();
  }

  return (
    <AdminShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold uppercase text-body">Payments</h1>
        <div className="flex gap-2">
          <button className="btn-outline px-3 py-1 text-sm" onClick={exportCsv}>Export CSV</button>
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
                {data.payments.map((p) => (
                  <tr key={p.id} className="border-t border-white/5">
                    <td className="px-3 py-2 text-muted">{new Date(p.created_at).toLocaleDateString('en-ZA')}</td>
                    <td className="px-3 py-2 text-body">{p.member_name}</td>
                    <td className="px-3 py-2 text-muted">{p.category}</td>
                    <td className="px-3 py-2 text-body">{zar(p.amount)}</td>
                    <td className="px-3 py-2"><span className="text-accent">{p.status}</span></td>
                    <td className="px-3 py-2 text-right">
                      {p.status === 'received' && (
                        <button className="text-xs text-error hover:underline" onClick={() => refund(p)}>Refund</button>
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

function ManualPayment({ onClose }) {
  const [form, setForm] = useState({ amount: '', category: 'monthly_fee', method: 'cash', description: '' });
  const [err, setErr] = useState('');
  async function save() {
    setErr('');
    try {
      await apiFetch('/admin/payments', { method: 'POST', body: { ...form, amount: Number(form.amount) } });
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
