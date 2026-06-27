// Audit trail viewer (corporate accountability/compliance). Owner/Manager.
// Shows who did what: status changes, deletions, refunds, settings & staff edits.
// Searchable, filterable by category/date, and exportable to CSV.
import { useEffect, useState } from 'react';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';
import { exportCsv } from '../../lib/csv.js';
import { SkeletonRows } from '../../components/ui.jsx';

const fmt = (d) => (d ? new Date(d).toLocaleString('en-ZA') : '—');
const LABELS = {
  'member.status': 'Member status changed',
  'member.delete': 'Member deleted',
  'member.renew': 'Membership renewed',
  'member.change_plan': 'Plan changed',
  'member.regenerate_code': 'Verification code reissued',
  'payment.manual': 'Manual payment recorded',
  'payment.refund': 'Payment refunded',
  'finance.remind': 'Payment reminder sent',
  'settings.save': 'Settings saved',
  'staff.create': 'Staff account created',
  'staff.update': 'Staff account updated',
  'staff.delete': 'Staff account deleted',
};
// Action prefixes for the category filter.
const CATEGORIES = [['', 'All categories'], ['member', 'Members'], ['payment', 'Payments'], ['finance', 'Finance'], ['staff', 'Staff'], ['settings', 'Settings']];

export default function AuditLog() {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (action) params.set('action', action);
    if (from) params.set('from', from);
    if (to) params.set('to', new Date(to + 'T23:59:59').toISOString());
    setError('');
    const t = setTimeout(() => {
      apiFetch(`/admin/audit?${params}`).then((d) => setEntries(d.entries || [])).catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [q, action, from, to]);

  function downloadCsv() {
    if (!entries?.length) return;
    exportCsv(
      `audit-log-${new Date().toISOString().slice(0, 10)}`,
      ['When', 'Who', 'Action', 'Entity', 'Entity ID', 'Details'],
      entries.map((e) => [fmt(e.created_at), e.admin_name, LABELS[e.action] || e.action, e.entity, e.entity_id, e.detail])
    );
  }

  return (
    <AdminShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold uppercase text-body">Audit Log</h1>
        <button className="btn-outline px-3 py-1 text-sm" onClick={downloadCsv} disabled={!entries?.length}>Export CSV</button>
      </div>
      <p className="mt-1 text-muted">A record of important staff actions, most recent first.</p>

      <div className="admin-toolbar mt-5">
        <input className="field admin-toolbar__grow" placeholder="Search actor, action, detail…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="field sm:w-44" value={action} onChange={(e) => setAction(e.target.value)}>
          {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label className="text-xs text-muted">From<input className="field mt-1" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-xs text-muted">To<input className="field mt-1" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>

      {error && <p className="mt-4 text-error">{error}</p>}
      {!entries && !error && <div className="mt-5"><SkeletonRows rows={8} cols={4} /></div>}

      {entries && (
        <div className="mt-5 overflow-x-auto rounded-xl border border-white/5">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-muted">
              <tr><th className="px-4 py-2">When</th><th className="px-4 py-2">Who</th><th className="px-4 py-2">Action</th><th className="px-4 py-2">Details</th></tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-white/5">
                  <td className="px-4 py-2 whitespace-nowrap text-muted">{fmt(e.created_at)}</td>
                  <td className="px-4 py-2 text-body">{e.admin_name}</td>
                  <td className="px-4 py-2 text-accent">{LABELS[e.action] || e.action}</td>
                  <td className="px-4 py-2 text-muted">{e.detail || ''}</td>
                </tr>
              ))}
              {!entries.length && <tr><td colSpan={4} className="px-4 py-6 text-center text-muted">No activity matches these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
