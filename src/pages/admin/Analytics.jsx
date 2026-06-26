// Attendance & analytics (spec 4.10). Lightweight CSS bar charts (no chart lib).
import { useEffect, useState } from 'react';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';

const zar = (n) => 'R' + Number(n || 0).toLocaleString('en-ZA');

export default function Analytics() {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    apiFetch('/admin/analytics').then(setD).catch((e) => setError(e.message));
  }, []);

  return (
    <AdminShell>
      <h1 className="text-2xl font-bold uppercase text-body">Analytics</h1>
      {error && <p className="mt-4 text-error">{error}</p>}
      {d && (
        <>
          {d.retention && (
            <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat label="Active members" value={d.retention.active} />
              <Stat label="New (30 days)" value={d.retention.new_30d} />
              <Stat label="Lapsed" value={d.retention.lapsed} />
              <Stat label="Churn rate" value={`${d.retention.churn_rate}%`} accent />
            </div>
          )}
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Bars title="Check-ins (last 30 days)" data={d.checkins_per_day} />
            <Bars title="Busiest hours (last 30 days)" data={d.busiest_hours} subtitle="Check-ins by hour of day (00–23)" />
            <Bars title="Most popular classes (30 days)" data={d.popular_classes} subtitle="By bookings" />
            <Bars title="Revenue trend (6 months)" data={d.revenue_trend} fmt={zar} />
            <Bars title="Tier distribution" data={d.tier_distribution} />
            <Bars title="Medical aid providers" data={d.medical_aid.by_provider} subtitle={`${d.medical_aid.with_aid} of ${d.medical_aid.total} members have medical aid`} />
            <Bars title="Member status" data={d.status_counts} />
          </div>
        </>
      )}
    </AdminShell>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="card">
      <div className={`font-display text-3xl ${accent ? 'text-accent' : 'text-body'}`}>{value}</div>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

function Bars({ title, subtitle, data, fmt = (n) => n }) {
  const entries = Object.entries(data || {}).sort((a, b) => a[0].localeCompare(b[0]));
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <div className="card">
      <h2 className="font-display uppercase text-body">{title}</h2>
      {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      <div className="mt-3 space-y-1.5">
        {entries.length ? entries.map(([k, v]) => (
          <div key={k} className="flex items-center gap-2 text-xs">
            <span className="w-24 truncate text-muted">{k.replace(/_/g, ' ')}</span>
            <div className="h-3 flex-1 overflow-hidden rounded bg-elevated">
              <div className="h-full bg-accent" style={{ width: `${(v / max) * 100}%` }} />
            </div>
            <span className="w-16 text-right text-body">{fmt(v)}</span>
          </div>
        )) : <p className="text-sm text-muted">No data yet.</p>}
      </div>
    </div>
  );
}
