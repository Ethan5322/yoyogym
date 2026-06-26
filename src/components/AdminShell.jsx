// Shared admin chrome — corporate, fully responsive (spec Part 4.1, RBAC).
//   Desktop (lg+): fixed left sidebar with grouped navigation + user footer.
//   Mobile/tablet: top bar with a hamburger that opens a slide-in drawer.
// Visual/layout only — no business logic changes.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useBranding } from '../lib/branding.js';

// Grouped navigation reads as an organised product, not a random row of buttons.
const GROUPS = [
  {
    title: 'Overview',
    items: [
      { to: '/admin', label: 'Dashboard', icon: '▣', roles: ['owner', 'manager'], exact: true },
      { to: '/admin/today', label: 'Today', icon: '◷', roles: ['owner', 'manager', 'reception'] },
    ],
  },
  {
    title: 'Front Desk',
    items: [
      { to: '/admin/scan', label: 'Scan', icon: '⛨', roles: ['owner', 'manager', 'reception'] },
      { to: '/admin/verify', label: 'Verify', icon: '✓', roles: ['owner', 'manager', 'reception'] },
      { to: '/admin/register-member', label: 'Register', icon: '＋', roles: ['owner', 'manager', 'reception'] },
      { to: '/admin/visitors', label: 'Visitors', icon: '◍', roles: ['owner', 'manager', 'reception'] },
      { to: '/admin/incidents', label: 'Incidents', icon: '!', roles: ['owner', 'manager', 'reception'] },
    ],
  },
  {
    title: 'People',
    items: [
      { to: '/admin/members', label: 'Members', icon: '☰', roles: ['owner', 'manager'] },
      { to: '/admin/attendance', label: 'Attendance', icon: '▤', roles: ['owner', 'manager', 'reception'] },
      { to: '/admin/trainers', label: 'Trainers', icon: '★', roles: ['owner', 'manager'] },
      { to: '/admin/clients', label: 'My Clients', icon: '◆', roles: ['owner', 'manager', 'trainer'] },
    ],
  },
  {
    title: 'Scheduling',
    items: [
      { to: '/admin/classes', label: 'Classes', icon: '◈', roles: ['owner', 'manager'] },
      { to: '/admin/calendar', label: 'Calendar', icon: '▦', roles: ['owner', 'manager'] },
    ],
  },
  {
    title: 'Business',
    items: [
      { to: '/admin/payments', label: 'Payments', icon: '$', roles: ['owner', 'manager'] },
      { to: '/admin/analytics', label: 'Analytics', icon: '▮', roles: ['owner', 'manager'] },
      { to: '/admin/communications', label: 'Comms', icon: '✉', roles: ['owner', 'manager'] },
      { to: '/admin/catalog', label: 'Catalog', icon: '▤', roles: ['owner', 'manager'] },
      { to: '/admin/qr-codes', label: 'QR Codes', icon: '▩', roles: ['owner', 'manager'] },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/admin/audit', label: 'Audit Log', icon: '❏', roles: ['owner', 'manager'] },
      { to: '/admin/staff', label: 'Staff & Roles', icon: '☷', roles: ['owner'] },
      { to: '/admin/settings', label: 'Settings', icon: '⚙', roles: ['owner'] },
    ],
  },
];

export default function AdminShell({ children }) {
  const { user, logout } = useAuth();
  const branding = useBranding();
  const gymName = branding.name || 'Yoyo GYM';
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setOpen(false), [pathname]);

  function handleLogout() {
    logout();
    navigate('/admin/login', { replace: true });
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
        <span className="font-display text-lg font-bold uppercase tracking-wider text-accent">{gymName}</span>
        <span className="text-xs uppercase tracking-wide text-muted">{user?.role}</span>
      </header>

      {/* ===== Mobile drawer overlay ===== */}
      {open && <div className="admin-overlay lg:hidden" onClick={() => setOpen(false)} />}

      {/* ===== Sidebar (fixed on desktop, drawer on mobile) ===== */}
      <aside className={`admin-sidebar ${open ? 'is-open' : ''}`}>
        <div className="admin-brand">
          <span className="font-display text-xl font-bold uppercase tracking-wider text-accent">{gymName}</span>
          <span className="text-[10px] uppercase tracking-[0.25em] text-muted">Management</span>
        </div>

        <nav className="admin-nav">
          {visibleGroups.map((g) => (
            <div key={g.title} className="admin-nav__group">
              <div className="admin-nav__title">{g.title}</div>
              {g.items.map((n) => (
                <Link key={n.to} to={n.to} className={`admin-link ${isActive(n) ? 'is-active' : ''}`}>
                  <span className="admin-link__icon">{n.icon}</span>
                  <span>{n.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="admin-userbox">
          <div className="min-w-0">
            <div className="truncate text-sm text-body">{user?.full_name}</div>
            <div className="text-xs uppercase tracking-wide text-accent">{user?.role}</div>
          </div>
          <button onClick={handleLogout} className="btn-outline px-3 py-1.5 text-xs">Logout</button>
        </div>
      </aside>

      {/* ===== Main content ===== */}
      <div className="admin-content">
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
