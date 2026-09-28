// The logo on a gym's own screens (CLAUDE.md §37): the gym's logo when it has
// set one in Settings → Gym Profile, otherwise the Yoyo Gyms logo. A gym logo
// that fails to load falls back to Yoyo's rather than a broken image.
import { useState } from 'react';
import { useBranding } from '../lib/branding.js';
import { LOGO_ON_DARK } from '../../shared/brand.js';

export default function BrandLogo({ className = 'h-12 w-auto', alt }) {
  const b = useBranding();
  const [failed, setFailed] = useState(false);
  const src = b.logo_url && !failed ? b.logo_url : LOGO_ON_DARK;
  return (
    <img
      src={src}
      alt={alt ?? (b.name || 'Yoyo Gyms')}
      className={`object-contain ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
