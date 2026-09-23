// Application routing (spec Part 8). Public splash loads eagerly; everything
// else is lazy-loaded so the QR-scan landing is fast on mobile (spec 6.4).
import { Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy, useEffect } from 'react';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Splash from './pages/Splash.jsx';
import { loadBranding } from './lib/branding.js';
import { captureGym } from './lib/gym.js';

// Public (member-facing)
const Register = lazy(() => import('./pages/Register.jsx'));
const MemberPortal = lazy(() => import('./pages/MemberPortal.jsx'));
const PublicProfile = lazy(() => import('./pages/PublicProfile.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

// Admin
const AdminLogin = lazy(() => import('./pages/admin/Login.jsx'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard.jsx'));
const VerifyScreen = lazy(() => import('./pages/admin/VerifyScreen.jsx'));
const MembersList = lazy(() => import('./pages/admin/MembersList.jsx'));
const MemberDetail = lazy(() => import('./pages/admin/MemberDetail.jsx'));
const TodayOverview = lazy(() => import('./pages/admin/TodayOverview.jsx'));
const ClassManagement = lazy(() => import('./pages/admin/ClassManagement.jsx'));
const TrainerManagement = lazy(() => import('./pages/admin/TrainerManagement.jsx'));
const PaymentsAdmin = lazy(() => import('./pages/admin/PaymentsAdmin.jsx'));
const Analytics = lazy(() => import('./pages/admin/Analytics.jsx'));
const Communications = lazy(() => import('./pages/admin/Communications.jsx'));
const CalendarAdmin = lazy(() => import('./pages/admin/CalendarAdmin.jsx'));
const Catalog = lazy(() => import('./pages/admin/Catalog.jsx'));
const Settings = lazy(() => import('./pages/admin/Settings.jsx'));
const ManualRegister = lazy(() => import('./pages/admin/ManualRegister.jsx'));
const QrCodes = lazy(() => import('./pages/admin/QrCodes.jsx'));
const Clients = lazy(() => import('./pages/admin/Clients.jsx'));
const FaceScan = lazy(() => import('./pages/admin/FaceScan.jsx'));
const Attendance = lazy(() => import('./pages/admin/Attendance.jsx'));
const Visitors = lazy(() => import('./pages/admin/Visitors.jsx'));
const Incidents = lazy(() => import('./pages/admin/Incidents.jsx'));
const Staff = lazy(() => import('./pages/admin/Staff.jsx'));
const AuditLog = lazy(() => import('./pages/admin/AuditLog.jsx'));
const Inbox = lazy(() => import('./pages/admin/Inbox.jsx'));

const owner = ['owner'];
const mgr = ['owner', 'manager'];
const recep = ['owner', 'manager', 'reception'];
const trainer = ['owner', 'manager', 'trainer'];

function Fallback() {
  return <div className="flex min-h-screen items-center justify-center bg-bg text-muted">Loading…</div>;
}

const guard = (roles, el) => <ProtectedRoute roles={roles}>{el}</ProtectedRoute>;

export default function App() {
  // Apply each gym's accent colour + title at runtime (no per-gym code).
  useEffect(() => {
    // WHICH GYM, BEFORE ANYTHING ELSE IS FETCHED. A member arrives at
    // /g/<slug>/register from the app or a scanned QR, and loadBranding() is
    // itself a gym-scoped request — capturing after it would fetch the wrong
    // gym's name and colours, or none at all.
    captureGym();
    loadBranding();
  }, []);

  return (
    <Suspense fallback={<Fallback />}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Splash />} />
        <Route path="/register" element={<Register />} />
        <Route path="/member" element={<MemberPortal />} />
        <Route path="/p/:type/:key" element={<PublicProfile />} />

        {/* Entering a specific gym — from the app, or a scanned QR (D-036).
            The slug is captured by captureGym() above and then travels on
            every API call; these routes render the SAME screens, so there is
            one registration flow and one member portal, not two. */}
        <Route path="/g/:slug" element={<Splash />} />
        <Route path="/g/:slug/register" element={<Register />} />
        <Route path="/g/:slug/member" element={<MemberPortal />} />
        <Route path="/g/:slug/p/:type/:key" element={<PublicProfile />} />

        {/* The gym's OWN admin panel, entered by slug.
            This is where an owner lands from the platform ("Open your gym
            admin panel"), and it is the only gym-scoped admin route that
            needs to exist: captureGym() stores the slug on arrival, and from
            sign-in onwards the gym travels inside the signed token, which the
            server trusts over anything the browser says. Duplicating the other
            23 guarded routes under /g/ would add no isolation and 23 chances
            to fall out of step. */}
        <Route path="/g/:slug/admin/login" element={<AdminLogin />} />
        <Route path="/g/:slug/admin/*" element={<Navigate to="/admin" replace />} />

        {/* Admin */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={guard(mgr, <Dashboard />)} />
        <Route path="/admin/verify" element={guard(recep, <VerifyScreen />)} />
        <Route path="/admin/scan" element={guard(recep, <FaceScan />)} />
        <Route path="/admin/attendance" element={guard(recep, <Attendance />)} />
        <Route path="/admin/visitors" element={guard(recep, <Visitors />)} />
        <Route path="/admin/incidents" element={guard(recep, <Incidents />)} />
        <Route path="/admin/members" element={guard(mgr, <MembersList />)} />
        <Route path="/admin/members/:id" element={guard(mgr, <MemberDetail />)} />
        <Route path="/admin/today" element={guard(recep, <TodayOverview />)} />
        <Route path="/admin/classes" element={guard(mgr, <ClassManagement />)} />
        <Route path="/admin/trainers" element={guard(mgr, <TrainerManagement />)} />
        <Route path="/admin/payments" element={guard(mgr, <PaymentsAdmin />)} />
        <Route path="/admin/analytics" element={guard(mgr, <Analytics />)} />
        <Route path="/admin/calendar" element={guard(mgr, <CalendarAdmin />)} />
        <Route path="/admin/communications" element={guard(mgr, <Communications />)} />
        <Route path="/admin/register-member" element={guard(recep, <ManualRegister />)} />
        <Route path="/admin/catalog" element={guard(mgr, <Catalog />)} />
        <Route path="/admin/qr-codes" element={guard(mgr, <QrCodes />)} />
        <Route path="/admin/settings" element={guard(owner, <Settings />)} />
        <Route path="/admin/staff" element={guard(owner, <Staff />)} />
        <Route path="/admin/audit" element={guard(mgr, <AuditLog />)} />
        <Route path="/admin/inbox" element={guard(mgr, <Inbox />)} />
        <Route path="/admin/clients" element={guard(trainer, <Clients />)} />

        <Route path="/admin/*" element={<Navigate to="/admin" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
