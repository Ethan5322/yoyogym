// Shared admin chrome: top bar with the signed-in user + logout, and a
// role-aware navigation bar (RBAC, spec Part 4.1) that is ALWAYS visible and
// wraps to multiple rows on small screens (no hidden mobile menu).
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

const NAV = [
  { to: '/admin', label: 'Dashboard', roles: ['owner', 'manager'], exact: true },
  { to: '/admin/scan', label: '🛡️ Scan', roles: ['owner', 'manager', 'reception'] },
  { to: '/admin/verify', label: 'Verify', roles: ['owner', 'manager', 'reception'] },
  { to: '/admin/members', label: 'Members', roles: ['owner', 'manager'] },
  { to: '/admin/today', label: 'Today', roles: ['owner', 'manager', 'reception'] },
  { to: '/admin/attendance', label: 'Attendance', roles: ['owner', 'manager', 'reception'] },
  { to: '/admin/classes', label: 'Classes', roles: ['owner', 'manager'] },
  { to: '/admin/trainers', label: 'Trainers', roles: ['owner', 'manager'] },
  { to: '/admin/calendar', label: 'Calendar', roles: ['owner', 'manager'] },
  { to: '/admin/payments', label: 'Payments', roles: ['owner', 'manager'] },
  { to: '/admin/analytics', label: 'Analytics', roles: ['owner', 'manager'] },
  { to: '/admin/communications', label: 'Comms', roles: ['owner', 'manager'] },
  { to: '/admin/register-member', label: 'Register', roles: ['owner', 'manager', 'reception'] },
  { to: '/admin/catalog', label: 'Catalog', roles: ['owner', 'manager'] },
  { to: '/admin/qr-codes', label: 'QR Codes', roles: ['owner', 'manager'] },
  { to: '/admin/settings', label: 'Settings', roles: ['owner'] },
  { to: '/admin/clients', label: 'My Clients', roles: ['owner', 'manager', 'trainer'] },
];

export default function AdminShell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  function handleLogout() {
    logout();
    navigate('/admin/login', { replace: true });
  }

  const items = NAV.filter((n) => n.roles.includes(user?.role));
  const isActive = (n) => (n.exact ? pathname === n.to : pathname.startsWith(n.to));

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-white/5 bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-3">
          {/* Top row: brand + user + logout */}
          <div className="flex items-center justify-between">
            <span className="font-display text-xl font-bold uppercase text-accent">Yoyo GYM Admin</span>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm text-body">{user?.full_name}</div>
                <div className="text-xs uppercase tracking-wide text-accent">{user?.role}</div>
              </div>
              <button onClick={handleLogout} className="btn-outline px-4 py-2 text-sm">
                Logout
              </button>
            </div>
          </div>

          {/* Nav row: always visible, wraps on small screens */}
          <nav className="mt-3 flex flex-wrap gap-2">
            {items.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={[
                  'rounded-lg px-3 py-1.5 text-sm transition',
                  isActive(n) ? 'bg-accent text-black' : 'bg-elevated text-muted hover:text-body',
                ].join(' ')}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
