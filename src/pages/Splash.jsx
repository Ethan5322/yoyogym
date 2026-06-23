// Splash / landing screen (spec 2.2). Branded entry shown after a QR scan.
// Gym name/logo/tagline come from settings in a later phase; placeholders here.
import { Link } from 'react-router-dom';

export default function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center">
      <div className="w-full max-w-sm animate-fade-up">
        {/* Logo placeholder — replaced by gym logo from settings (Phase 7) */}
        <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-accent">
          <span className="font-display text-3xl font-bold text-black">G</span>
        </div>

        <h1 className="text-4xl font-bold uppercase text-body">Your Gym Name</h1>
        <p className="mt-3 text-muted">Train harder. Live stronger.</p>

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
