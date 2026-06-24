// Phase 99 §B — Intelligent Attendance Dashboard.
// Live floor status + today's attendance board (green/red ticks, etc.) with
// 30s polling + skeletons, plus a Reports tab (rates, at-risk, best, peak hours).
import { useEffect, useRef, useState } from 'react';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';

const TIER = {
  basic: 'bg-gray-500 text-white',
  standard: 'bg-blue-500 text-white',
  premium: 'bg-yellow-500 text-black',
  vip: 'bg-zinc-300 text-black',
};
const STATUS = {
  on_schedule: { icon: '🟢', label: 'On schedule' },
  not_arrived: { icon: '🔴', label: 'Not arrived' },
  extra: { icon: '🟠', label: 'Extra visit' },
  overtime: { icon: '🟡', label: 'Overtime' },
  gray: { icon: '⚫', label: 'No schedule' },
};
const FILTERS = {
  all: () => true,
  present: (r) => r.inside,
  not_arrived: (r) => r.status === 'not_arrived',
  overtime: (r) => r.status === 'overtime',
  extra: (r) => r.status === 'extra',
};
const dur = (m) => (m == null ? '—' : `${Math.floor(m / 60)}h ${m % 60}m`);
const time = (d) => (d ? new Date(d).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : null);

export default function Attendance() {
  const [tab, setTab] = useState('live');
  return (
    <AdminShell>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold uppercase text-body">Attendance</h1>
        <div className="flex gap-2">
          {['live', 'reports'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-1.5 text-sm font-display uppercase ${tab === t ? 'bg-accent text-black' : 'bg-elevated text-muted'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      {tab === 'live' ? <LiveBoard /> : <Reports />}
    </AdminShell>
  );
}

function LiveBoard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [updated, setUpdated] = useState(null);
  const timer = useRef(null);

  function load() {
    apiFetch('/admin/attendance-live')
      .then((d) => {
        setData(d);
        setUpdated(new Date());
      })
      .catch((e) => setError(e.message));
  }
  useEffect(() => {
    load();
    timer.current = setInterval(load, 30000); // live feel without exposing the DB to the browser
    return () => clearInterval(timer.current);
  }, []);

  function printSheet() {
    if (!data) return;
    const today = new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const rowsHtml = data.board
      .map((r) => `<tr>
        <td>${r.name}</td><td>${(r.tier || '').toUpperCase()}</td><td>${r.slot_label}</td>
        <td>${time(r.checked_in_at) || '—'}</td><td>${r.checked_out_at ? time(r.checked_out_at) : r.inside ? 'Inside' : '—'}</td>
        <td>${dur(r.minutes)}</td><td>${STATUS[r.status]?.label || ''}</td></tr>`)
      .join('');
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Attendance ${today}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px}h1{margin:0}h2{color:#666;font-weight:normal;margin:2px 0 16px}
      table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #ccc;padding:6px;text-align:left}
      th{background:#f2f2f2}</style></head><body>
      <h1>YOYO GYM — Daily Attendance</h1><h2>${today} · ${data.checked_in_today} checked in · ${data.inside_count} inside</h2>
      <table><thead><tr><th>Member</th><th>Tier</th><th>Slot</th><th>In</th><th>Out</th><th>Hours</th><th>Status</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table></body></html>`);
    w.document.close();
    w.print();
  }

  if (error) return <p className="mt-4 text-error">{error}</p>;
  if (!data) return <SkeletonBoard />;

  const pct = Math.round((data.inside_count / data.capacity) * 100);
  const capColor = pct >= 95 ? 'bg-error' : pct >= 80 ? 'bg-orange-500' : 'bg-success';
  const rows = data.board.filter(FILTERS[filter]).filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      {/* KPIs */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Inside now" value={data.inside_count} accent />
        <Kpi label="Checked in today" value={data.checked_in_today} />
        <Kpi label="Expected, not arrived" value={data.expected_not_arrived} danger={data.expected_not_arrived > 0} />
        <Kpi label="Overtime" value={data.overtime_count} danger={data.overtime_count > 0} />
      </div>

      {/* capacity bar */}
      <div className="card mt-3">
        <div className="mb-1 flex justify-between text-sm">
          <span className="text-muted">Capacity</span>
          <span className="text-body">{data.inside_count} / {data.capacity} ({pct}%)</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-elevated">
          <div className={`h-full ${capColor} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      </div>

      {/* controls */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {Object.keys(FILTERS).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-lg px-3 py-1 text-xs uppercase ${filter === f ? 'bg-accent text-black' : 'bg-elevated text-muted'}`}>
            {f.replace('_', ' ')}
          </button>
        ))}
        <input className="field ml-auto w-48" placeholder="Search name…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-outline px-3 py-1 text-xs" onClick={printSheet}>🖨 Print sheet</button>
      </div>
      {updated && <p className="mt-1 text-right text-xs text-muted">Updated {updated.toLocaleTimeString('en-ZA')} · auto-refresh 30s</p>}

      {/* board */}
      <div className="mt-2 overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-muted">
            <tr>
              <th className="px-3 py-2"></th>
              <th className="px-3 py-2">Member</th>
              <th className="px-3 py-2 hidden sm:table-cell">Tier</th>
              <th className="px-3 py-2 hidden md:table-cell">Slot</th>
              <th className="px-3 py-2">In</th>
              <th className="px-3 py-2">Out</th>
              <th className="px-3 py-2">Hours</th>
              <th className="px-3 py-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.member_id} className="border-t border-white/5">
                <td className="px-3 py-2">
                  {r.photo_url ? (
                    <img src={r.photo_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-elevated text-xs text-muted">{r.name?.[0]}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-body">{r.name}</td>
                <td className="px-3 py-2 hidden sm:table-cell">
                  {r.tier && <span className={`rounded px-2 py-0.5 text-xs font-bold ${TIER[r.tier] || 'bg-gray-600 text-white'}`}>{r.tier.toUpperCase()}</span>}
                </td>
                <td className="px-3 py-2 hidden text-muted md:table-cell">{r.slot_label}</td>
                <td className="px-3 py-2 text-body">{time(r.checked_in_at) || <span className="text-error">—</span>}</td>
                <td className="px-3 py-2">{r.checked_out_at ? time(r.checked_out_at) : r.inside ? <span className="text-success">Inside</span> : '—'}</td>
                <td className="px-3 py-2 text-body">{dur(r.minutes)}</td>
                <td className="px-3 py-2 text-center" title={STATUS[r.status]?.label}>
                  <span className="text-lg">{STATUS[r.status]?.icon}</span>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-muted">No members match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Legend />
    </div>
  );
}

function Reports() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    apiFetch('/admin/attendance-report').then(setData).catch((e) => setError(e.message));
  }, []);
  if (error) return <p className="mt-4 text-error">{error}</p>;
  if (!data) return <SkeletonBoard />;

  const maxPeak = Math.max(1, ...Object.values(data.peak_hours));
  const band = (r) => (r >= 90 ? 'bg-success' : r >= 70 ? 'bg-blue-500' : r >= 50 ? 'bg-yellow-500' : 'bg-error');

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div className="card">
        <h2 className="font-display uppercase text-body">Attendance Rate (30 days)</h2>
        <div className="mt-3 space-y-1.5">
          {data.members.slice(0, 15).map((m) => (
            <div key={m.member_id} className="flex items-center gap-2 text-xs">
              <span className="w-28 truncate text-muted">{m.name}</span>
              <div className="h-3 flex-1 overflow-hidden rounded bg-elevated">
                <div className={`h-full ${band(m.rate)}`} style={{ width: `${m.rate}%` }} />
              </div>
              <span className="w-16 text-right text-body">{m.visits}/{m.expected} · {m.rate}%</span>
            </div>
          ))}
          {!data.members.length && <p className="text-sm text-muted">No data.</p>}
        </div>
      </div>

      <div className="card">
        <h2 className="font-display uppercase text-error">At Risk (churn)</h2>
        <p className="text-xs text-muted">No visit in 10+ days — follow up.</p>
        <div className="mt-3 space-y-1">
          {data.at_risk.length ? data.at_risk.map((m, i) => (
            <div key={i} className="flex justify-between border-b border-white/5 py-1 text-sm">
              <span className="text-body">{m.name}</span>
              <span className="text-muted">{m.days_since == null ? 'never' : `${m.days_since}d ago`}</span>
            </div>
          )) : <p className="text-sm text-success">No members at risk 🎉</p>}
        </div>
      </div>

      <div className="card">
        <h2 className="font-display uppercase text-success">Best Attendance</h2>
        <div className="mt-3 space-y-1">
          {data.best.map((m, i) => (
            <div key={i} className="flex justify-between border-b border-white/5 py-1 text-sm">
              <span className="text-body">{i + 1}. {m.name}</span>
              <span className="text-accent">{m.visits} visits</span>
            </div>
          ))}
          {!data.best.length && <p className="text-sm text-muted">No visits yet.</p>}
        </div>
      </div>

      <div className="card">
        <h2 className="font-display uppercase text-body">Peak Hours</h2>
        <div className="mt-3 space-y-1.5">
          {Array.from({ length: 24 }, (_, h) => h).filter((h) => data.peak_hours[h]).map((h) => (
            <div key={h} className="flex items-center gap-2 text-xs">
              <span className="w-12 text-muted">{String(h).padStart(2, '0')}:00</span>
              <div className="h-3 flex-1 overflow-hidden rounded bg-elevated">
                <div className="h-full bg-accent" style={{ width: `${(data.peak_hours[h] / maxPeak) * 100}%` }} />
              </div>
              <span className="w-8 text-right text-body">{data.peak_hours[h]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent, danger }) {
  return (
    <div className="card">
      <div className="text-sm text-muted">{label}</div>
      <div className={`mt-1 font-display text-3xl ${danger ? 'text-error' : accent ? 'text-success' : 'text-body'}`}>{value}</div>
    </div>
  );
}
function Legend() {
  return (
    <p className="mt-3 text-xs text-muted">
      🟢 On schedule &nbsp; 🔴 Scheduled, not arrived &nbsp; 🟠 Extra visit &nbsp; 🟡 Overtime &nbsp; ⚫ No schedule today
    </p>
  );
}
function SkeletonBoard() {
  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 animate-skeleton rounded-2xl bg-elevated" />)}
      </div>
      <div className="h-10 animate-skeleton rounded-xl bg-elevated" />
      {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-12 animate-skeleton rounded-lg bg-elevated" />)}
    </div>
  );
}
