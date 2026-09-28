// Splash / landing screen (spec 2.2). Branded entry shown after a QR scan.
// Gym name, tagline, logo and welcome message come live from Admin → Settings
// (via /api/content) — no per-gym code change required.
import { Link, useParams } from 'react-router-dom';
import { useBranding } from '../lib/branding.js';
import GymIcon from '../components/GymIcon.jsx';
import GymBackdrop from '../components/GymBackdrop.jsx';
import GymOffer from '../components/GymOffer.jsx';

export default function Splash() {
  const b = useBranding();
  // Under /g/<gym>/ the links keep the gym in the address, so a refreshed or
  // shared link still knows which gym it is for. Single-gym mode is unchanged.
  const { slug } = useParams();
  const base = slug ? `/g/${encodeURIComponent(slug)}` : '';
  const name = b.name || 'Your Gym Name';
  const tagline = b.tagline || 'Train harder. Live stronger.';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      {/* The gym's poster behind its welcome page (CLAUDE.md §39.1 Q4). */}
      <GymBackdrop />
      <div className="w-full max-w-sm animate-fade-up">
        {/* The gym's own icon: its logo, or its letter in its colour (CLAUDE.md §37.1 Q7). */}
        <div className="mb-8 flex justify-center"><GymIcon size={96} alt={name} /></div>

        <h1 className="text-4xl font-bold uppercase text-body">{name}</h1>
        <p className="mt-3 text-muted">{tagline}</p>

        {b.welcome_message && (
          <p className="mx-auto mt-4 max-w-xs text-sm text-muted">{b.welcome_message}</p>
        )}

        <div className="mt-12 space-y-4">
          <Link to={`${base}/register`} className="btn-primary w-full">
            Join as a New Member
          </Link>
          <Link to={`${base}/member`} className="btn-outline w-full">
            I am Already a Member
          </Link>
        </div>

        <p className="mt-10 text-xs text-muted">
          Secure &amp; private registration · POPIA compliant
        </p>
      </div>

      {/* The gym's plans, add-ons, services and facilities (CLAUDE.md §41.1 Q1),
          below the two choices — someone deciding whether to join reads them. */}
      <div className="mx-auto mt-14 w-full max-w-3xl pb-16">
        <GymOffer heading={`What ${name} offers`} />
      </div>
    </div>
  );
}
