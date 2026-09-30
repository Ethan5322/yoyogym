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
  // The poster WHOLE, never cropped (CLAUDE.md §47.1 Q3): its own colours,
  // blurred, fill the screen; the poster itself sits on top, fitted — phone
  // width on a computer — under a veil dark enough for every word.
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-bg">
      <img src={b.poster_url} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl" />
      <img
        src={b.poster_url}
        alt=""
        className="absolute inset-y-0 left-1/2 h-full w-full max-w-[520px] -translate-x-1/2 object-contain object-top"
        onError={() => setFailed(true)}
      />
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(7,12,16,0.72) 0%, rgba(7,12,16,0.86) 55%, rgba(7,12,16,0.95) 100%)' }}
      />
    </div>
  );
}
