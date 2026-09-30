// Dashboard home with live metrics + alert banners (spec 4.2).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminShell from '../../components/AdminShell.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { apiFetch } from '../../lib/api.js';
import { StatCard, SkeletonStats, StatusPill } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import YoyoPlanCard from '../../components/YoyoPlanCard.jsx';

// Whole rands on the dashboard: headline figures, not a statement. Payments
// and receipts keep the cents.
const zar = (n) => 'R' + Math.round(Number(n || 0)).toLocaleString('en-ZA');

/** "Good morning" / "Good afternoon" / "Good evening", by the device's clock. */
function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** "Thandi Mokoena" → "TM", for a member's avatar. */
const initials = (name) =>
  String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** 30 days after a member asked to delete their account (CLAUDE.md §46.1 Q3). */
function eraseDate(requestedAt) {
  const t = new Date(requestedAt || Date.now()).getTime() + 30 * 24 * 60 * 60 * 1000;
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function Dashboard() {
  const { user } = useAuth();
  const [d, setD] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/admin/dashboard').then(setD).catch((e) => setError(e.message));
  }, []);

  const first = user?.full_name?.split(' ')[0] || '';
  const today = new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' });

  // What needs someone's attention, most serious first. Red: act now. Amber:
  // have a look. Each opens the filtered work queue it refers to (CLAUDE.md
  // §39.1 Q4 — one calm list instead of a stack of red banners).
  const attention = !d
    ? []
    : [
        // A gym that sells nothing yet cannot take a single member: said first,
        // because it blocks everything else (a brand-new gym, 2026-09-29).
        d.enabled_plans === 0 && {
          tone: 'bad',
          to: '/admin/catalog',
          text: 'Price and switch on a membership plan in Catalog — members cannot join until you do',
        },
        // A legal request (POPIA) comes first — one row per member.
        ...(d.deletion_requests || []).map((m) => ({
          tone: 'bad',
          to: `/admin/members/${m.id}`,
          // Erased by the morning job 30 days after asking (CLAUDE.md §46.1 Q3).
          text: `${m.full_name} asked to delete their account — erased automatically on ${eraseDate(m.data_deletion_requested_at || m.updated_at)}`,
        })),
        d.failed_payments > 0 && {
          tone: 'bad',
          to: '/admin/payments?status=failed',
          text: `${plural(d.failed_payments, 'failed payment', 'failed payments')} to follow up`,
        },
        d.parq_flags > 0 && {
          tone: 'warn',
          to: '/admin/members?parq=1',
          text: `${plural(d.parq_flags, 'member', 'members')} with a PAR-Q medical flag`,
        },
        d.expiring_soon > 0 && {
          tone: 'warn',
          to: '/admin/members?expiring=7',
          text: `${plural(d.expiring_soon, 'membership', 'memberships')} expiring within 7 days`,
        },
        d.classes_full > 0 && {
          tone: 'warn',
          to: '/admin/today',
          text: `${plural(d.classes_full, 'class', 'classes')} today at 90%+ capacity`,
        },
        d.unread_messages > 0 && {
          tone: 'warn',
          to: '/admin/inbox',
          text: `${plural(d.unread_messages, 'unread message', 'unread messages')} in your inbox`,
        },
      ].filter(Boolean);

  return (
    <AdminShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{today}</p>
          <h1 className="mt-1 font-body text-3xl font-extrabold normal-case tracking-tight text-body">
            {greeting()}
            {first ? `, ${first}` : ''}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/admin/scan" className="btn-primary !px-5 !py-2.5">
            <Icon name="scan" /> Scan
          </Link>
          <Link to="/admin/register-member" className="btn-outline !px-5 !py-2.5">
            <Icon name="userplus" /> Register
          </Link>
        </div>
      </div>

      {/* What the gym pays Yoyo Gyms, and Pay now — the owner's alone (CLAUDE.md §48). */}
      {user?.role === 'owner' && <YoyoPlanCard />}

      {error && <p className="mt-4 rounded-xl bg-error/10 px-4 py-3 text-error">{error}</p>}
      {!d && !error && (
        <div className="mt-6">
          <SkeletonStats count={8} />
        </div>
      )}

      {d && (
        <>
          {attention.length > 0 && (
            <section className="card mt-6 overflow-hidden !p-0">
              <h2 className="px-5 pb-2 pt-5 font-body text-xs font-bold uppercase tracking-[0.14em] text-muted">Needs attention</h2>
              {attention.map((a) => (
                <Link
                  key={a.text}
                  to={a.to}
                  className="flex items-center gap-3 border-t border-white/5 px-5 py-3.5 text-sm text-body transition hover:bg-white/[0.03]"
                >
                  <span className={`h-2.5 w-2.5 flex-none rounded-full ${a.tone === 'bad' ? 'bg-error' : 'bg-warning'}`} />
                  <span className="flex-1">{a.text}</span>
                  <Icon name="chevron" size={16} className="text-muted" />
                </Link>
              ))}
            </section>
          )}

          {/* The four numbers an owner opens the panel for. */}
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard hero icon="checkin" label="Check-ins today" value={d.checkins_today} to="/admin/today" />
            <StatCard hero icon="members" label="Active members" value={d.active_members} to="/admin/members?status=active" />
            <StatCard
              hero
              icon="money"
              label="Revenue this month"
              value={zar(d.revenue_month)}
              to="/admin/payments"
              delta={d.revenue_month - d.revenue_month_prev}
            />
            <StatCard hero icon="payments" label="Outstanding" value={zar(d.outstanding_total)} to="/admin/payments" deltaGood={false} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="New today" value={d.new_today} to="/admin/members" />
            <StatCard label="New this week" value={d.new_week} to="/admin/members" />
            <StatCard label="New this month" value={d.new_month} to="/admin/members" delta={d.new_month - d.new_month_prev} />
            <StatCard label="Lapsed (win back)" value={d.lapsed_members} to="/admin/members?status=lapsed" deltaGood={false} />
            <StatCard label="Revenue today" value={zar(d.revenue_today)} to="/admin/payments" />
            <StatCard label="Unread messages" value={d.unread_messages ?? 0} to="/admin/inbox" />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section className="card">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-body text-xs font-bold uppercase tracking-[0.14em] text-muted">Recent registrations</h2>
                <Link to="/admin/members" className="text-sm font-semibold text-accent">
                  View all
                </Link>
              </div>
              {d.recent_registrations.length ? (
                d.recent_registrations.map((m) => (
                  <div key={m.membership_number} className="flex items-center gap-3 border-t border-white/5 py-3 first:border-t-0">
                    <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-white/[0.06] text-xs font-bold text-body">
                      {initials(m.full_name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-body">{m.full_name}</div>
                      <div className="font-data text-xs text-muted">{m.membership_number}</div>
                    </div>
                    <StatusPill status={m.status} />
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted">No registrations yet.</p>
              )}
            </section>

            <section className="card">
              <h2 className="mb-3 font-body text-xs font-bold uppercase tracking-[0.14em] text-muted">Recent activity</h2>
              {d.activity?.length ? (
                <ol className="relative ml-1 border-l border-white/10">
                  {d.activity.map((e, i) => (
                    <li key={i} className="relative py-2.5 pl-5">
                      <span className="absolute -left-[5px] top-4 h-2.5 w-2.5 rounded-full bg-accent" />
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-body">{e.text}</span>
                        <span className="flex-none text-xs tabular-nums text-muted">
                          {new Date(e.at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted">No recent activity.</p>
              )}
            </section>
          </div>

          <section className="card mt-4">
            <h2 className="mb-4 font-body text-xs font-bold uppercase tracking-[0.14em] text-muted">Quick actions</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['/admin/scan', 'scan', 'Scan'],
                ['/admin/verify', 'verify', 'Verify'],
                ['/admin/attendance', 'attendance', 'Attendance'],
                ['/admin/members', 'members', 'Members'],
              ].map(([to, icon, label]) => (
                <Link
                  key={to}
                  to={to}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-white/[0.07] bg-elevated/60 px-3 py-4 text-sm font-semibold text-body transition hover:-translate-y-0.5 hover:border-accent/40"
                >
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                    <Icon name={icon} size={20} />
                  </span>
                  {label}
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </AdminShell>
  );
}
