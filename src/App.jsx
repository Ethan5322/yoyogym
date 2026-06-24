// Application routing (spec Part 8). Public splash loads eagerly; everything
// else is lazy-loaded so the QR-scan landing is fast on mobile (spec 6.4).
import { Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Splash from './pages/Splash.jsx';

// Public (member-facing)
const Register = lazy(() => import('./pages/Register.jsx'));
const MemberPortal = lazy(() => import('./pages/MemberPortal.jsx'));
const PaymentCallback = lazy(() => import('./pages/PaymentCallback.jsx'));
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

const owner = ['owner'];
const mgr = ['owner', 'manager'];
const recep = ['owner', 'manager', 'reception'];
const trainer = ['owner', 'manager', 'trainer'];

function Fallback() {
  return <div className="flex min-h-screen items-center justify-center bg-bg text-muted">Loading…</div>;
}

const guard = (roles, el) => <ProtectedRoute roles={roles}>{el}</ProtectedRoute>;

export default function App() {
  return (
    <Suspense fallback={<Fallback />}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Splash />} />
        <Route path="/register" element={<Register />} />
        <Route path="/member" element={<MemberPortal />} />
        <Route path="/payment/callback" element={<PaymentCallback />} />

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
        <Route path="/admin/clients" element={guard(trainer, <Clients />)} />

        <Route path="/admin/*" element={<Navigate to="/admin" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
