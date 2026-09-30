// The GYM's own icon, on everything its members see (CLAUDE.md §37.1 Q7):
// the logo the gym uploaded in Settings → Gym Profile, or — until it has one —
// a badge with the gym's first letter in the gym's own colour. A logo that
// fails to load falls back to the badge, never to a broken image.
//
// The Yoyo Gyms logo is for IDs, PDFs and the gym's admin screens (BrandLogo).
import { useState } from 'react';
import { useBranding } from '../lib/branding.js';

/** @param {{ size?: number, className?: string, alt?: string }} props  size = height in px */
export default function GymIcon({ size = 48, className = '', alt }) {
  const b = useBranding();
  const [failed, setFailed] = useState(false);
  const name = b.name || '';

  // A logo sits in the same rounded light tile as every gym, fitted inside
  // with a margin — never stretched, cut, or wider than the tile (CLAUDE.md
  // §47.1 Q3). The same size as the letter badge it replaces.
  if (b.logo_url && !failed) {
    return (
      <span
        style={{ width: size, height: size, borderRadius: Math.round(size * 0.28), padding: Math.max(3, Math.round(size * 0.12)) }}
        className={`inline-flex flex-none items-center justify-center bg-white ${className}`}
      >
        <img src={b.logo_url} alt={alt ?? name} className="h-full w-full object-contain" onError={() => setFailed(true)} />
      </span>
    );
  }
  return (
    <span
      role="img"
      aria-label={alt ?? name}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.55), borderRadius: Math.round(size * 0.28) }}
      className={`inline-flex items-center justify-center bg-accent font-display font-bold leading-none text-accent-ink ${className}`}
    >
      {(name.trim()[0] || '·').toUpperCase()}
    </span>
  );
}
