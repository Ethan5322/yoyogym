// Gym owner sign-in by EMAIL + PASSWORD alone (CLAUDE.md §43.1 Q2).
//
// The app used to ask an owner to search for and pick their gym, then sign in
// to it. Here the owner types the email they applied with and their password;
// the server finds their gym and signs them in to it with that gym's own
// sign-in, and this page opens the gym's admin panel.
//
// The session is stored exactly where the gym's own sign-in stores it — its
// per-gym key — so the admin panel finds it as if the owner had signed in
// there. Staff have no Yoyo account and keep choosing their gym.
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo.jsx';
import { tokenKey } from '../lib/api.js';
import { captureInApp, inApp } from '../lib/inApp.js';

const ADMIN_TOKEN = 'gym_admin_token';
// The gym this browser last signed an owner in to, so reopening the app goes
// straight back to it while the session lasts.
const LAST_GYM = 'yoyo.owner.lastgym';
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** Into the gym's own admin panel, through its sign-in page — which moves straight on with a session. */
function openGym(slug, app) {
  const params = new URLSearchParams();
  if (app) params.set('app', '1');
  if (app?.back) params.set('back', app.back);
  const query = params.toString();
  window.location.assign(`/g/${encodeURIComponent(slug)}/admin/login${query ? `?${query}` : ''}`);
}

function readLast() {
  try {
    const slug = localStorage.getItem(LAST_GYM);
    return slug && SAFE_SLUG.test(slug) && localStorage.getItem(tokenKey(ADMIN_TOKEN, slug)) ? slug : null;
  } catch {
    return null;
  }
}

export default function OwnerLogin() {
  const location = useLocation();
  captureInApp(location.search);
  const app = inApp();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Already signed in on this device: straight back to the gym.
  useEffect(() => {
    const last = readLast();
    if (last) openGym(last, app);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      // fetch, not apiFetch: this page belongs to no gym, and must not send
      // the gym header a previous page in this tab may have left behind.
      const res = await fetch('/api/auth/owner-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, remember: Boolean(app) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.token || !SAFE_SLUG.test(String(data.gym?.slug || ''))) {
        setError(data.error || 'Sign-in failed. Please try again.');
        return;
      }
      try {
        localStorage.setItem(tokenKey(ADMIN_TOKEN, data.gym.slug), data.token);
        localStorage.setItem(LAST_GYM, data.gym.slug);
      } catch {
        setError('This browser will not keep you signed in (storage is blocked).');
        return;
      }
      openGym(data.gym.slug, app);
    } catch {
      setError('No connection. Check your internet and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm animate-fade-up">
        {app?.back && (
          <a href={app.back} className="mb-6 inline-block text-sm text-muted hover:text-body">← Yoyo Gyms app</a>
        )}
        <div className="mb-8 text-center">
          <BrandLogo className="mx-auto mb-6 h-20 w-auto" />
          <h1 className="text-3xl font-bold uppercase text-body">Gym owner sign in</h1>
          <p className="mt-2 text-sm text-muted">The email you applied with, and your password</p>
        </div>

        {error && <p className="mb-3 rounded-lg bg-error/10 px-3 py-2 text-sm text-error">{error}</p>}

        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="mb-1 block text-sm text-muted" htmlFor="owner-email">Email</label>
            <input id="owner-email" className="field" type="email" autoComplete="username" inputMode="email"
              value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted" htmlFor="owner-password">Password</label>
            <input id="owner-password" className="field" type="password" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-6 space-y-2 text-center text-sm text-muted">
          <p>
            <a className="font-semibold text-body underline" href="/platform/forgot">Forgot your password?</a>
          </p>
          <p>
            Gym staff?{' '}
            <a className="font-semibold text-body underline" href="/platform/find?next=admin">Choose your gym to sign in</a>
          </p>
          <p>
            Not a gym owner yet? <a className="font-semibold text-body underline" href="/platform/apply">Apply</a>
          </p>
        </div>
      </div>
    </div>
  );
}
