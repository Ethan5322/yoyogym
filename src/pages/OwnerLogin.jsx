// THE gym owner sign-in — the one door for owners (CLAUDE.md §43.1 Q2;
// design critique 2026-09-29, which found three owner doors in three looks).
//
// Email + password (+ a code, for an owner who set one up — D-119), and the
// account decides where it leads:
//
//   1. an open gym whose own sign-in takes them  -> that gym's admin panel
//      (POST /api/auth/owner-login: the GYM checks the password, lockout and
//      disabled accounts included — unchanged)
//   2. otherwise the same form is POSTED, as a real form, to /platform/login
//      with as=owner — the Yoyo owner account's own sign-in (login.js, the same
//      rule for every door) -> /platform/my-gym, e.g. an applicant whose gym is
//      not open yet
//   3. otherwise that sign-in sends the person back here with ONE fixed code,
//      and this page shows its one message.
//
// `?next=account` skips step 1: the owner asked for their Yoyo Gyms account
// (subscription, agreement, application), not their gym. Old
// /platform/login?as=owner links arrive that way.
//
// The gym session is stored exactly where the gym's own sign-in stores it —
// its per-gym key — so the admin panel finds it as if the owner had signed in
// there. Staff have no Yoyo account and keep choosing their gym.
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo.jsx';
import { PAGE_HEADERS } from '../lib/api.js';
import { captureInApp, inApp } from '../lib/inApp.js';
import { BRAND, hexToRgb, deepen } from '../../shared/brand.js';

// The gym this browser last signed an owner in to, so reopening the app goes
// straight back to it while the session lasts.
const LAST_GYM = 'yoyo.owner.lastgym';
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

// What /api/auth/owner-login says when NO open gym took these details (its
// INVALID). Only then is the form handed on to the Yoyo owner account; a gym
// that found the account and says it is locked or disabled is shown as it is.
// Pinned to the server's text by a test.
const NO_GYM_TOOK_IT = 'Invalid email or password';

// The owner account's refusals, by the fixed code /platform/login sends back
// (never text from the URL). The same words as platform/login.js — pinned by
// a test, since this file may not import platform/ (D-081).
const REFUSALS = {
  invalid: 'Invalid email, password or authentication code.',
  locked: 'Too many failed attempts. This account is locked for 15 minutes.',
  needs2fa:
    'This account requires two-factor authentication before it can be used. ' +
    'Ask a platform owner to finish setting up your authenticator app.',
};

// The email typed before the hand-over, so a refusal does not empty the box.
// This tab only, and cleared as soon as it is read.
const TYPED = 'yoyo.owner.email';

// Yoyo's own look, whatever gym this browser visited last: at the main
// address the page would otherwise wear that gym's colour (CLAUDE.md §37).
const LIME = hexToRgb(BRAND.lime).join(' ');
const YOYO = {
  '--accent': BRAND.lime,
  '--accent-rgb': LIME,
  '--accent-soft': `rgb(${LIME} / 0.15)`,
  '--accent-deep': deepen(BRAND.lime),
  '--accent-ink': BRAND.limeInk,
  backgroundColor: BRAND.ground,
};

const FIELD =
  'mt-1 block min-h-[48px] w-full rounded-[14px] border border-white/[0.12] bg-bg px-4 py-3 text-base font-normal ' +
  'text-white outline-none focus:border-accent focus:ring-2 focus:ring-accent/30';
const LABEL = 'block text-[13px] font-bold text-white/[0.62]';

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
    // Only WHICH gym: the session itself is the gym's HttpOnly cookie, and the
    // gym's own sign-in page moves straight on while it lasts (CLAUDE.md §46.1 Q1).
    return slug && SAFE_SLUG.test(slug) ? slug : null;
  } catch {
    return null;
  }
}

function takeTyped() {
  try {
    const v = sessionStorage.getItem(TYPED) || '';
    sessionStorage.removeItem(TYPED);
    return v;
  } catch {
    return '';
  }
}

export default function OwnerLogin() {
  const location = useLocation();
  const navigate = useNavigate();
  captureInApp(location.search);
  const app = inApp();

  const [params] = useState(() => new URLSearchParams(location.search));
  const toAccount = params.get('next') === 'account';
  const [email, setEmail] = useState(() => (REFUSALS[params.get('error')] ? takeTyped() : ''));
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [error, setError] = useState(() => REFUSALS[params.get('error')] || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // The refusal is shown once; a reload does not show it again.
    if (params.has('error')) {
      const rest = new URLSearchParams(params);
      rest.delete('error');
      navigate({ search: rest.toString() ? `?${rest}` : '' }, { replace: true });
    }
    // Already signed in to a gym on this device: straight back to it — unless
    // the owner asked for their account instead.
    const last = toAccount ? null : readLast();
    if (last) openGym(last, app);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Step 2: the same form, posted for real to the Yoyo owner account. */
  function handOn(form) {
    try {
      sessionStorage.setItem(TYPED, email.trim());
    } catch {
      /* the box starts empty after a refusal; nothing else changes */
    }
    form.submit(); // submit() does not fire onSubmit: this leaves the page
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    setError('');
    setBusy(true);
    if (toAccount) return handOn(form);

    let leaving = false;
    try {
      // fetch, not apiFetch: this page belongs to no gym, and must not send
      // the gym header a previous page in this tab may have left behind.
      const res = await fetch('/api/auth/owner-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...PAGE_HEADERS },
        body: JSON.stringify({ email: email.trim(), password, remember: Boolean(app) }),
        credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 && data.error === NO_GYM_TOOK_IT) {
        leaving = true;
        handOn(form);
        return;
      }
      if (!res.ok || !SAFE_SLUG.test(String(data.gym?.slug || ''))) {
        setError(data.error || 'Sign-in failed. Please try again.');
        return;
      }
      try {
        localStorage.setItem(LAST_GYM, data.gym.slug);
      } catch {
        /* not remembered: the next visit asks for the email again */
      }
      leaving = true;
      openGym(data.gym.slug, app);
    } catch {
      setError('No connection. Check your internet and try again.');
    } finally {
      if (!leaving) setBusy(false);
    }
  }

  const link = 'font-semibold text-white underline underline-offset-4';

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12 font-body" style={YOYO}>
      <div className="w-full max-w-[392px]">
        {app?.back && (
          <a href={app.back} className="mb-6 inline-block text-[13px] text-white/[0.62] hover:text-white">← Yoyo Gyms app</a>
        )}
        <BrandLogo className="mx-auto mb-8 h-auto w-36" />

        <form
          method="post"
          action="/platform/login"
          onSubmit={handleSubmit}
          className="grid gap-4 rounded-3xl border border-white/[0.12] bg-surface px-6 py-8"
        >
          <h1 className="text-center font-body text-[28px] font-extrabold normal-case leading-[1.15] tracking-normal text-white">
            {toAccount ? 'Your Yoyo Gyms account' : 'Gym owner sign in'}
          </h1>
          <p className="-mt-2 text-center text-[13px] text-white/[0.62]">
            {toAccount
              ? 'Your application, subscription and agreement.'
              : "Opens your gym's admin panel, or your application if your gym is not open yet."}
          </p>
          <input type="hidden" name="as" value="owner" />
          {toAccount && <input type="hidden" name="next" value="account" />}

          {error && (
            <p role="alert" className="text-[13px] font-semibold text-[#ff6b5e]">{error}</p>
          )}

          <label className={LABEL}>
            Email
            <input className={FIELD} name="email" type="email" autoComplete="username" inputMode="email"
              value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className={LABEL}>
            Password
            <input className={FIELD} name="password" type="password" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <details className="text-[13px] text-white/[0.62]">
            <summary className="flex min-h-[44px] cursor-pointer items-center font-semibold">I use an authentication code</summary>
            <label className={LABEL}>
              Authentication code, or a recovery code
              <input className={FIELD} name="totp" type="text" inputMode="numeric" autoComplete="one-time-code"
                placeholder="6 digits" value={totp} onChange={(e) => setTotp(e.target.value)} />
            </label>
          </details>

          <button type="submit" disabled={busy}
            className="min-h-[52px] rounded-full bg-accent px-6 text-base font-extrabold text-accent-ink transition hover:brightness-110 disabled:opacity-50">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="text-center text-[13px]">
            <a className={link} href="/platform/forgot">Forgot password?</a>
          </p>
        </form>

        <div className="mt-6 space-y-2 text-center text-[13px] text-white/[0.62]">
          <p>
            {toAccount ? (
              <a className={link} href="/owner/login">Open your gym instead</a>
            ) : (
              <>Subscription or agreement? <a className={link} href="/owner/login?next=account">Your Yoyo Gyms account</a></>
            )}
          </p>
          <p>
            Not a gym owner yet? <a className={link} href="/platform/apply">Apply to join Yoyo Gyms</a>
          </p>
          <p>
            Gym staff? <a className={link} href="/platform/find?next=admin">Choose your gym to sign in</a>
          </p>
        </div>
      </div>
    </main>
  );
}
