// Dashboard home with live metrics + alert banners (spec 4.2).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminShell from '../../components/AdminShell.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { apiFetch } from '../../lib/api.js';

const zar = (n) => 'R' + Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 });

export default function Dashboard() {
  const { user } = useAuth();
  const [d, setD] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/admin/dashboard').then(setD).catch((e) => setError(e.message));
  }, []);

  return (
    <AdminShell>
      <h1 className="text-2xl font-bold uppercase text-body">
        Welcome, {user?.full_name?.split(' ')[0]}
      </h1>
      <p className="mt-1 text-muted">Today at a glance</p>

      {error && <p className="mt-4 rounded-lg bg-error/10 px-3 py-2 text-error">{error}</p>}
      {!d && !error && <p className="mt-6 text-muted">Loading…</p>}

      {d && (
        <>
          {/* Alert banners — each links to the filtered work queue it refers to */}
          <div className="mt-4 space-y-2">
            {d.failed_payments > 0 && (
              <Banner tone="error" to="/admin/payments?status=failed">{d.failed_payments} failed payment(s) need attention.</Banner>
            )}
            {d.parq_flags > 0 && (
              <Banner tone="warn" to="/admin/members?parq=1">{d.parq_flags} member(s) with PAR-Q medical flags.</Banner>
            )}
            {d.expiring_soon > 0 && (
              <Banner tone="warn" to="/admin/members?expiring=7">{d.expiring_soon} membership(s) expiring within 7 days.</Banner>
            )}
            {d.classes_full > 0 && (
              <Banner tone="warn" to="/admin/today">{d.classes_full} class(es) today at 90%+ capacity.</Banner>
            )}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Check-ins Today" value={d.checkins_today} to="/admin/today" />
            <Stat label="New Today" value={d.new_today} to="/admin/members" />
            <Stat label="New This Week" value={d.new_week} to="/admin/members" />
            <Stat label="New This Month" value={d.new_month} to="/admin/members" />
            <Stat label="Active Members" value={d.active_members} to="/admin/members?status=active" />
            <Stat label="Lapsed (win-back)" value={d.lapsed_members} to="/admin/members?status=lapsed" />
            <Stat label="Revenue Today" value={zar(d.revenue_today)} to="/admin/payments" />
            <Stat label="Revenue This Month" value={zar(d.revenue_month)} to="/admin/payments" />
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <div className="card">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display uppercase text-body">Recent Registrations</h2>
                <Link to="/admin/members" className="text-sm text-accent">
                  View all →
                </Link>
              </div>
              {d.recent_registrations.length ? (
                d.recent_registrations.map((m) => (
                  <div key={m.membership_number} className="flex justify-between border-b border-white/5 py-2 text-sm">
                    <span className="text-body">{m.full_name}</span>
                    <span className="text-muted">{m.status}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted">No registrations yet.</p>
              )}
            </div>

            <div className="card">
              <h2 className="mb-3 font-display uppercase text-body">Recent Activity</h2>
              {d.activity?.length ? (
                d.activity.map((e, i) => (
                  <div key={i} className="flex justify-between border-b border-white/5 py-2 text-sm">
                    <span className="text-body">{e.text}</span>
                    <span className="text-muted">{new Date(e.at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted">No recent activity.</p>
              )}
            </div>
          </div>

          <div className="card mt-4">
            <h2 className="mb-3 font-display uppercase text-body">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Link to="/admin/scan" className="btn-primary">Scan</Link>
              <Link to="/admin/verify" className="btn-outline">Verify</Link>
              <Link to="/admin/attendance" className="btn-outline">Attendance</Link>
              <Link to="/admin/members" className="btn-outline">Members</Link>
            </div>
          </div>
        </>
      )}
    </AdminShell>
  );
}

function Stat({ label, value, to }) {
  const inner = (
    <>
      <div className="flex items-center justify-between text-sm text-muted">
        <span>{label}</span>
        {to && <span className="text-accent opacity-0 transition group-hover:opacity-100">→</span>}
      </div>
      <div className="mt-2 font-display text-3xl text-body">{value}</div>
    </>
  );
  if (to) {
    return (
      <Link to={to} className="card group transition hover:border-accent/40 hover:bg-surface">
        {inner}
      </Link>
    );
  }
  return <div className="card">{inner}</div>;
}
function Banner({ tone, children, to }) {
  const cls = tone === 'error' ? 'bg-error/10 text-error' : 'bg-accent-soft text-accent';
  const content = (
    <span className="flex items-center justify-between gap-3">
      <span>{children}</span>
      {to && <span aria-hidden className="shrink-0">→</span>}
    </span>
  );
  if (to) {
    return <Link to={to} className={`block rounded-lg px-4 py-2 text-sm transition hover:brightness-125 ${cls}`}>{content}</Link>;
  }
  return <div className={`rounded-lg px-4 py-2 text-sm ${cls}`}>{content}</div>;
}
