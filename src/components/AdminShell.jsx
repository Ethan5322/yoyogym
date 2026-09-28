// Shared admin chrome — corporate, fully responsive (spec Part 4.1, RBAC).
//   Desktop (lg+): fixed left sidebar with grouped navigation + user footer.
//   Mobile/tablet: top bar with a hamburger that opens a slide-in drawer.
// Visual/layout only — no business logic changes.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useBranding } from '../lib/branding.js';
import { apiFetch } from '../lib/api.js';
import UpgradeNotice from './UpgradeNotice.jsx';
import BrandLogo from './BrandLogo.jsx';
import Icon from './Icon.jsx';

// Grouped navigation reads as an organised product, not a random row of buttons.
//
// `feature` is the plan feature a screen needs (absent = every plan). A screen
// outside the gym's plan is SHOWN WITH A LOCK rather than hidden: an owner who
// never sees a feature never learns it exists. Pressing it explains the
// upgrade instead of opening a screen that would only fail. UX only - the
// routers are what enforce (CLAUDE.md §18.4).
const GROUPS = [
  {
    title: 'Overview',
    items: [
      { to: '/admin', label: 'Dashboard', icon: 'dashboard', roles: ['owner', 'manager'], exact: true },
      { to: '/admin/today', label: 'Today', icon: 'today', roles: ['owner', 'manager', 'reception'] },
      { to: '/admin/inbox', label: 'Inbox', icon: 'inbox', roles: ['owner', 'manager'], feature: 'messaging' },
    ],
  },
  {
    title: 'Front Desk',
    items: [
      { to: '/admin/scan', label: 'Scan', icon: 'scan', roles: ['owner', 'manager', 'reception'], feature: 'face' },
      { to: '/admin/verify', label: 'Verify', icon: 'verify', roles: ['owner', 'manager', 'reception'] },
      { to: '/admin/register-member', label: 'Register', icon: 'register', roles: ['owner', 'manager', 'reception'] },
      { to: '/admin/visitors', label: 'Visitors', icon: 'visitors', roles: ['owner', 'manager', 'reception'], feature: 'access_control' },
      { to: '/admin/incidents', label: 'Incidents', icon: 'incidents', roles: ['owner', 'manager', 'reception'], feature: 'access_control' },
    ],
  },
  {
    title: 'People',
    items: [
      { to: '/admin/members', label: 'Members', icon: 'members', roles: ['owner', 'manager'] },
      { to: '/admin/attendance', label: 'Attendance', icon: 'attendance', roles: ['owner', 'manager', 'reception'], feature: 'reporting' },
      { to: '/admin/trainers', label: 'Trainers', icon: 'trainers', roles: ['owner', 'manager'], feature: 'trainers' },
      { to: '/admin/clients', label: 'My Clients', icon: 'clients', roles: ['owner', 'manager', 'trainer'], feature: 'trainers' },
    ],
  },
  {
    title: 'Scheduling',
    items: [
      { to: '/admin/classes', label: 'Classes', icon: 'classes', roles: ['owner', 'manager'], feature: 'classes' },
      { to: '/admin/calendar', label: 'Calendar', icon: 'calendar', roles: ['owner', 'manager'], feature: 'classes' },
    ],
  },
  {
    title: 'Business',
    items: [
      { to: '/admin/payments', label: 'Payments', icon: 'payments', roles: ['owner', 'manager'] },
      { to: '/admin/analytics', label: 'Analytics', icon: 'analytics', roles: ['owner', 'manager'], feature: 'advanced_analytics' },
      { to: '/admin/communications', label: 'Comms', icon: 'comms', roles: ['owner', 'manager'], feature: 'messaging' },
      { to: '/admin/catalog', label: 'Catalog', icon: 'catalog', roles: ['owner', 'manager'] },
      { to: '/admin/qr-codes', label: 'QR Codes', icon: 'qr', roles: ['owner', 'manager'] },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/admin/audit', label: 'Audit Log', icon: 'audit', roles: ['owner', 'manager'], feature: 'audit' },
      { to: '/admin/staff', label: 'Staff & Roles', icon: 'staff', roles: ['owner'] },
      { to: '/admin/settings', label: 'Settings', icon: 'settings', roles: ['owner'] },
    ],
  },
];

/** "Lindiwe Dube" → "LD": the person's initials, for the avatar. */
const initials = (name) =>
  String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

export default function AdminShell({ children }) {
  const { user, logout, hasFeature } = useAuth();
  const branding = useBranding();
  const gymName = branding.name || 'Your gym';
  const poster = /^https:\/\/[^\s"'<>()\\]+$/.test(branding.poster_url || '') ? branding.poster_url : '';
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [unread, setUnread] = useState(0);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setOpen(false), [pathname]);

  // Poll the inbox unread count for the notification badge (owner/manager).
  useEffect(() => {
    if (!['owner', 'manager'].includes(user?.role)) return;
    // Not on a plan without messaging: the poll would be refused every
    // minute, and each refusal would open the upgrade notice.
    if (!hasFeature('messaging')) return;
    let active = true;
    const poll = () => apiFetch('/admin/inbox?unread=1&limit=1').then((d) => active && setUnread(d.unread_count || 0)).catch(() => {});
    poll();
    const t = setInterval(poll, 60000);
    return () => { active = false; clearInterval(t); };
  }, [user?.role, pathname, hasFeature]);

  function handleLogout() {
    logout();
    navigate('/admin/login', { replace: true });
  }

  // Global jump-to-member search (owner/manager). Reuses the URL-driven
  // Members filter so the result page opens pre-searched.
  const canSearch = ['owner', 'manager'].includes(user?.role);
  function submitSearch(e) {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    navigate(`/admin/members?q=${encodeURIComponent(q)}`);
    setSearch('');
  }

  const isActive = (n) => (n.exact ? pathname === n.to : pathname.startsWith(n.to));
  const visibleGroups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((n) => n.roles.includes(user?.role)),
  })).filter((g) => g.items.length);

  return (
    <div className="admin min-h-screen bg-bg">
      {/* ===== Mobile top bar ===== */}
      <header className="admin-topbar lg:hidden">
        <button aria-label="Menu" className="admin-burger" onClick={() => setOpen(true)}>
          <span /><span /><span />
        </button>
        <span className="flex min-w-0 items-center gap-2">
          <BrandLogo alt="" className="h-7 w-auto" />
          <span className="truncate text-base font-bold text-body">{gymName}</span>
        </span>
        <span className="admin-avatar admin-avatar--sm" aria-label={user?.role}>{initials(user?.full_name)}</span>
      </header>

      {/* ===== Mobile drawer overlay ===== */}
      {open && <div className="admin-overlay lg:hidden" onClick={() => setOpen(false)} />}

      {/* ===== Sidebar (fixed on desktop, drawer on mobile) ===== */}
      <aside className={`admin-sidebar ${open ? 'is-open' : ''}`}>
        {/* The gym's poster behind its name (§39.1 Q4); the Yoyo Gyms logo
            stays, small, as the platform mark (§37.1 Q7). */}
        <div className={`admin-brand ${poster ? 'has-poster' : ''}`}>
          {poster && <img src={poster} alt="" className="admin-brand__poster" />}
          <div className="admin-brand__body">
            <BrandLogo alt="Yoyo Gyms" className="h-9 w-auto self-start" />
            <span className="admin-brand__name">{gymName}</span>
            <span className="text-[11px] uppercase tracking-[0.2em] text-muted">Gym management</span>
          </div>
        </div>

        {canSearch && (
          <form onSubmit={submitSearch} className="px-3 pb-2">
            <input
              className="field w-full py-2 text-sm"
              type="search"
              placeholder="Search members…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search members"
            />
          </form>
        )}

        <nav className="admin-nav">
          {visibleGroups.map((g) => (
            <div key={g.title} className="admin-nav__group">
              <div className="admin-nav__title">{g.title}</div>
              {g.items.map((n) =>
                hasFeature(n.feature) ? (
                  <Link key={n.to} to={n.to} className={`admin-link ${isActive(n) ? 'is-active' : ''}`}>
                    <span className="admin-link__icon"><Icon name={n.icon} /></span>
                    <span>{n.label}</span>
                    {n.label === 'Inbox' && unread > 0 && (
                      <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-ink">{unread}</span>
                    )}
                  </Link>
                ) : (
                  <button
                    key={n.to}
                    type="button"
                    className="admin-link w-full text-left opacity-60"
                    aria-label={`${n.label} - not in your plan`}
                    onClick={() => window.dispatchEvent(new CustomEvent('yoyo:upgrade', { detail: { feature: n.feature } }))}
                  >
                    <span className="admin-link__icon"><Icon name={n.icon} /></span>
                    <span>{n.label}</span>
                    <span className="ml-auto text-xs" aria-hidden="true">🔒</span>
                  </button>
                )
              )}
            </div>
          ))}
        </nav>

        <div className="admin-userbox">
          <span className="admin-avatar" aria-hidden="true">{initials(user?.full_name)}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-body">{user?.full_name}</div>
            <div className="text-xs capitalize text-muted">{user?.role}</div>
          </div>
          <button onClick={handleLogout} className="admin-iconbtn" aria-label="Log out" title="Log out">
            <Icon name="logout" />
          </button>
        </div>
      </aside>

      {/* ===== Main content ===== */}
      <div className="admin-content">
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>

      <UpgradeNotice />
    </div>
  );
}
