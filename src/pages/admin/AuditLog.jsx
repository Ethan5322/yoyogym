// Audit trail viewer (corporate accountability/compliance). Owner/Manager.
// Shows who did what: status changes, deletions, refunds, settings & staff edits.
import { useEffect, useState } from 'react';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';

const fmt = (d) => (d ? new Date(d).toLocaleString('en-ZA') : '—');
const LABELS = {
  'member.status': 'Member status changed',
  'member.delete': 'Member deleted',
  'member.renew': 'Membership renewed',
  'member.change_plan': 'Plan changed',
  'member.regenerate_code': 'Verification code reissued',
  'payment.manual': 'Manual payment recorded',
  'payment.refund': 'Payment refunded',
  'settings.save': 'Settings saved',
  'staff.create': 'Staff account created',
  'staff.update': 'Staff account updated',
  'staff.delete': 'Staff account deleted',
};

export default function AuditLog() {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    apiFetch('/admin/audit').then((d) => setEntries(d.entries || [])).catch((e) => setError(e.message));
  }, []);

  return (
    <AdminShell>
      <h1 className="text-2xl font-bold uppercase text-body">Audit Log</h1>
      <p className="mt-1 text-muted">A record of important staff actions, most recent first.</p>
      {error && <p className="mt-4 text-error">{error}</p>}

      <div className="mt-5 overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-muted">
            <tr><th className="px-4 py-2">When</th><th className="px-4 py-2">Who</th><th className="px-4 py-2">Action</th><th className="px-4 py-2">Details</th></tr>
          </thead>
          <tbody>
            {(entries || []).map((e) => (
              <tr key={e.id} className="border-t border-white/5">
                <td className="px-4 py-2 whitespace-nowrap text-muted">{fmt(e.created_at)}</td>
                <td className="px-4 py-2 text-body">{e.admin_name}</td>
                <td className="px-4 py-2 text-accent">{LABELS[e.action] || e.action}</td>
                <td className="px-4 py-2 text-muted">{e.detail || ''}</td>
              </tr>
            ))}
            {entries && !entries.length && <tr><td colSpan={4} className="px-4 py-6 text-center text-muted">No activity recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
