// Member management list — search + filters (spec 4.4). Owner/Manager.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';
import { exportCsv } from '../../lib/csv.js';
import { SkeletonRows } from '../../components/ui.jsx';

const STATUSES = ['', 'new', 'active', 'lapsed', 'suspended'];
const TIERS = [['', 'All tiers'], ['basic', 'Basic'], ['standard', 'Standard'], ['premium', 'Premium'], ['vip', 'VIP']];
const CONTRACTS = [['', 'All contracts'], ['month_to_month', 'Month-to-month'], ['3_month', '3 month'], ['6_month', '6 month'], ['12_month', '12 month']];

export default function MembersList() {
  // Filters are URL-driven so dashboard banners/cards can deep-link here and a
  // shared/bookmarked URL reopens the same filtered view (corporate workflow).
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') || '');
  const [status, setStatus] = useState(sp.get('status') || '');
  const [tier, setTier] = useState(sp.get('tier') || '');
  const [contract, setContract] = useState(sp.get('contract') || '');
  const [parq, setParq] = useState(sp.get('parq') === '1');
  const [expiring, setExpiring] = useState(sp.get('expiring') || '');
  const [page, setPage] = useState(Number(sp.get('page')) || 1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    if (tier) params.set('tier', tier);
    if (contract) params.set('contract', contract);
    if (parq) params.set('parq', '1');
    if (expiring) params.set('expiring', expiring);
    setSp(params, { replace: true }); // keep the address bar in sync with the view
    setError('');
    const t = setTimeout(() => {
      apiFetch(`/admin/members?${params.toString()}`)
        .then(setData)
        .catch((e) => setError(e.message));
    }, 250); // debounce search
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, tier, contract, parq, expiring, page]);

  function downloadCsv() {
    if (!data?.members?.length) return;
    exportCsv(
      `members-${new Date().toISOString().slice(0, 10)}`,
      ['Name', 'Number', 'Phone', 'Email', 'Status', 'PAR-Q'],
      data.members.map((m) => [m.full_name, m.membership_number, m.phone, m.email, m.status, m.parq_flag ? 'Yes' : 'No'])
    );
  }

  return (
    <AdminShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold uppercase text-body">Members</h1>
        <button className="btn-outline px-3 py-1 text-sm" onClick={downloadCsv} disabled={!data?.members?.length}>
          Export CSV
        </button>
      </div>

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

      {expiring && (
        <button
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-xs text-accent"
          onClick={() => { setPage(1); setExpiring(''); }}
        >
          Expiring within {expiring} days · clear ✕
        </button>
      )}

      {error && <p className="mt-4 text-error">{error}</p>}

      {!data && !error && <div className="mt-4"><SkeletonRows rows={8} cols={4} /></div>}

      {data && <div className="mt-4 overflow-hidden rounded-xl border border-white/5">
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
      </div>}

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
