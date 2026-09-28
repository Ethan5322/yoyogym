// The gym's POSTER, behind its members' screens and its admin sign-in
// (CLAUDE.md §39.1 Q3, Q4). Uploaded by the owner in Settings → Poster.
//
// Full-screen and fixed, darkened with the Yoyo near-black so every word on
// top stays readable, whatever the poster. It sits behind the page (z-index
// -1) and above the body's own background, so a page needs no change beyond
// not painting an opaque background of its own. No poster: nothing is drawn,
// and the page looks exactly as it did.
import { useState } from 'react';
import { useBranding } from '../lib/branding.js';

/** Only the gym's own https picture — never a script URL or anything else. */
const SAFE = /^https:\/\/[^\s"'<>()\\]+$/;

export default function GymBackdrop() {
  const b = useBranding();
  const [failed, setFailed] = useState(false);
  if (!b.poster_url || failed || !SAFE.test(b.poster_url)) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <img
        src={b.poster_url}
        alt=""
        className="h-full w-full scale-105 object-cover blur-[2px]"
        onError={() => setFailed(true)}
      />
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(7,12,16,0.72) 0%, rgba(7,12,16,0.86) 55%, rgba(7,12,16,0.95) 100%)' }}
      />
    </div>
  );
}
