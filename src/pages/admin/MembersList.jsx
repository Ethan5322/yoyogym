// Member management list — search + filters (spec 4.4). Owner/Manager.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';

const STATUSES = ['', 'new', 'active', 'expiring', 'lapsed', 'suspended'];
const TIERS = [['', 'All tiers'], ['basic', 'Basic'], ['standard', 'Standard'], ['premium', 'Premium'], ['vip', 'VIP']];
const CONTRACTS = [['', 'All contracts'], ['month_to_month', 'Month-to-month'], ['3_month', '3 month'], ['6_month', '6 month'], ['12_month', '12 month']];

export default function MembersList() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [tier, setTier] = useState('');
  const [contract, setContract] = useState('');
  const [parq, setParq] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    if (tier) params.set('tier', tier);
    if (contract) params.set('contract', contract);
    if (parq) params.set('parq', '1');
    setError('');
    const t = setTimeout(() => {
      apiFetch(`/admin/members?${params.toString()}`)
        .then(setData)
        .catch((e) => setError(e.message));
    }, 250); // debounce search
    return () => clearTimeout(t);
  }, [q, status, tier, contract, parq, page]);

  return (
    <AdminShell>
      <h1 className="text-2xl font-bold uppercase text-body">Members</h1>

      <div className="admin-toolbar mt-5">
        <input
          className="field admin-toolbar__grow"
          placeholder="Search name, number, phone, email, ID…"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
        />
        <select
          className="field sm:w-40"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s ? s[0].toUpperCase() + s.slice(1) : 'All statuses'}
            </option>
          ))}
        </select>
        <select
          className="field sm:w-40"
          value={tier}
          onChange={(e) => {
            setPage(1);
            setTier(e.target.value);
          }}
        >
          {TIERS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select
          className="field sm:w-44"
          value={contract}
          onChange={(e) => {
            setPage(1);
            setContract(e.target.value);
          }}
        >
          {CONTRACTS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 whitespace-nowrap text-sm text-muted">
          <input type="checkbox" checked={parq} onChange={(e) => { setPage(1); setParq(e.target.checked); }} />
          PAR-Q flag
        </label>
      </div>

      {error && <p className="mt-4 text-error">{error}</p>}

      <div className="mt-4 overflow-hidden rounded-xl border border-white/5">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-muted">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Number</th>
              <th className="px-4 py-2 hidden sm:table-cell">Phone</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {data?.members.map((m) => (
              <tr key={m.id} className="border-t border-white/5 hover:bg-surface">
                <td className="px-4 py-2">
                  <Link to={`/admin/members/${m.id}`} className="text-body hover:text-accent">
                    {m.full_name} {m.parq_flag ? <span className="text-error">⚠</span> : ''}
                  </Link>
                </td>
                <td className="px-4 py-2 text-muted">{m.membership_number}</td>
                <td className="px-4 py-2 hidden text-muted sm:table-cell">{m.phone}</td>
                <td className="px-4 py-2">
                  <span className="text-accent">{m.status}</span>
                </td>
              </tr>
            ))}
            {data && !data.members.length && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted">
                  No members found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-4 text-sm">
          <button className="btn-outline px-3 py-1" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Prev
          </button>
          <span className="text-muted">
            Page {data.page} of {data.pages} · {data.total} total
          </span>
          <button
            className="btn-outline px-3 py-1"
            disabled={page >= data.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </AdminShell>
  );
}
