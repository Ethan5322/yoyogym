// Splash / landing screen (spec 2.2). Branded entry shown after a QR scan.
// Gym name, tagline, logo and welcome message come live from Admin → Settings
// (via /api/content) — no per-gym code change required.
import { Link } from 'react-router-dom';
import { useBranding } from '../lib/branding.js';

export default function Splash() {
  const b = useBranding();
  const name = b.name || 'Your Gym Name';
  const tagline = b.tagline || 'Train harder. Live stronger.';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center">
      <div className="w-full max-w-sm animate-fade-up">
        {b.logo_url ? (
          <img
            src={b.logo_url}
            alt={name}
            className="mx-auto mb-8 h-24 w-24 rounded-2xl object-contain"
          />
        ) : (
          <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-accent">
            <span className="font-display text-3xl font-bold text-black">
              {(name.trim()[0] || 'G').toUpperCase()}
            </span>
          </div>
        )}

        <h1 className="text-4xl font-bold uppercase text-body">{name}</h1>
        <p className="mt-3 text-muted">{tagline}</p>

        {b.welcome_message && (
          <p className="mx-auto mt-4 max-w-xs text-sm text-muted">{b.welcome_message}</p>
        )}

        <div className="mt-12 space-y-4">
          <Link to="/register" className="btn-primary w-full">
            Join as a New Member
          </Link>
          <Link to="/member" className="btn-outline w-full">
            I am Already a Member
          </Link>
        </div>

        <p className="mt-10 text-xs text-muted">
          Secure &amp; private registration · POPIA compliant
        </p>
      </div>
    </div>
  );
}
