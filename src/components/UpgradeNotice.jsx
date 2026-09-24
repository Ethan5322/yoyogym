// "This is not in your plan" — said once, clearly, with the way forward.
//
// CLAUDE.md §18.4: block, and offer the upgrade. The server refuses with 402
// and names the feature; apiFetch() announces it; this is where a person
// reads it. The owner is sent to their owner page, where plans are compared
// and changed. Anyone else is told who can change it, because a receptionist
// cannot buy a plan and should not be shown a button that pretends they can.
import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';

/** Plain names, for the sentence a person reads. */
export const FEATURE_NAMES = {
  classes: 'Classes and bookings',
  trainers: 'Trainers and personal training',
  messaging: 'Messages and announcements',
  reporting: 'Attendance and revenue reports',
  progress: 'Member progress tracking',
  data_io: 'Importing and exporting members',
  face: 'Face recognition',
  access_control: 'Visitors, incidents and access control',
  advanced_analytics: 'Advanced analytics',
  marketing: 'Bulk email',
  referrals: 'The referral programme',
  audit: 'The audit log',
};

export default function UpgradeNotice() {
  const { user } = useAuth();
  const [feature, setFeature] = useState(null);

  useEffect(() => {
    const onUpgrade = (e) => setFeature(e.detail?.feature ?? null);
    window.addEventListener('yoyo:upgrade', onUpgrade);
    return () => window.removeEventListener('yoyo:upgrade', onUpgrade);
  }, []);

  if (!feature) return null;

  const name = FEATURE_NAMES[feature] || 'This feature';
  const isOwner = user?.role === 'owner';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" role="dialog" aria-modal="true" aria-labelledby="upgrade-title">
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 text-center">
        <div className="text-3xl" aria-hidden="true">🔒</div>
        <h2 id="upgrade-title" className="mt-2 text-lg font-bold text-body">{name} is not in your plan</h2>
        <p className="mt-2 text-sm text-muted">
          {isOwner
            ? 'Upgrade your plan to switch it on. Nothing you already have changes, and no data is lost.'
            : 'Your gym owner can switch it on by upgrading the gym\'s plan.'}
        </p>

        {isOwner && (
          <a href="/platform/my-gym" className="mt-5 block w-full rounded-xl bg-accent px-4 py-3 font-semibold text-black">
            See plans
          </a>
        )}
        <button type="button" onClick={() => setFeature(null)} className="mt-3 w-full rounded-xl px-4 py-2 text-sm text-muted">
          Not now
        </button>
      </div>
    </div>
  );
}
