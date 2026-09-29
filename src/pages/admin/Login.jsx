// Admin gate (QR Type C). Username + password OR face verification -> JWT session.
import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';
import { apiFetch } from '../../lib/api.js';
import FaceCapture from '../../chatbot/components/FaceCapture.jsx';
import BrandLogo from '../../components/BrandLogo.jsx';
import { captureInApp, inApp } from '../../lib/inApp.js';
import GymBackdrop from '../../components/GymBackdrop.jsx';

export default function AdminLogin() {
  const { user, login, applySession, homeFor } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [faceMode, setFaceMode] = useState(false);

  // Opened from the phone app? Then sign-in stays until sign-out (§38.1 Q3).
  captureInApp(location.search);
  const app = inApp();

  if (user) return <Navigate to={homeFor()} replace />;

  function go(loggedIn) {
    const dest = location.state?.from?.pathname || homeFor(loggedIn);
    navigate(dest, { replace: true });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      go(await login(username.trim(), password, { remember: Boolean(app) }));
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  async function onFace(result) {
    if (!result?.descriptor) {
      setFaceMode(false);
      return;
    }
    setError('');
    setBusy(true);
    try {
      const { token, user } = await apiFetch('/auth/face-login', { method: 'POST', auth: false, body: { descriptor: result.descriptor, remember: Boolean(app) } });
      go(applySession(token, user));
    } catch (err) {
      setError(err.message || 'Face not recognised.');
      setFaceMode(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      {/* The gym's poster behind its admin sign-in (CLAUDE.md §39.1 Q4). */}
      <GymBackdrop />
      <div className="w-full max-w-sm animate-fade-up">
        {app?.back && (
          <a href={app.back} className="mb-6 inline-block text-sm text-muted hover:text-body">← Yoyo Gyms app</a>
        )}
        <div className="mb-8 text-center">
          <BrandLogo className="mx-auto mb-6 h-20 w-auto" />
          <h1 className="text-3xl font-bold uppercase text-body">Admin Access</h1>
          <p className="mt-2 text-sm text-muted">Verify your identity to continue</p>
        </div>

        {error && <p className="mb-3 rounded-lg bg-error/10 px-3 py-2 text-sm text-error">{error}</p>}

        {faceMode ? (
          <div className="card space-y-3">
            <p className="text-center text-sm text-muted">Look at the camera to verify</p>
            <FaceCapture mode="verify" onSubmit={onFace} />
            <button className="w-full text-sm text-muted hover:text-body" onClick={() => setFaceMode(false)}>
              ← Use password instead
            </button>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="card space-y-4">
              <div>
                <label className="mb-1 block text-sm text-muted">Email or username</label>
                <input className="field" type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted">Password</label>
                <input className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <button type="submit" className="btn-primary w-full" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
            <button className="btn-outline mt-3 w-full" onClick={() => { setError(''); setFaceMode(true); }}>
              🛡️ Verify with Face
            </button>
            {/* A WAY BACK IN. This page had none, so an owner whose password did
                not work was simply stuck (2026-09-29). The platform's reset sets
                the owner's Yoyo account AND this gym sign-in together; staff
                passwords are reset by the owner, in Staff. */}
            <div className="mt-6 space-y-1 text-center text-sm text-muted">
              <p>
                Forgot your password?{' '}
                <a className="font-semibold text-body underline" href="/platform/forgot">Gym owner: reset it by email</a>
              </p>
              <p>Staff: ask your gym owner — they can reset it in Staff.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
