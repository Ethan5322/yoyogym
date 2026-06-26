// Runtime branding — pulls each gym's name / tagline / accent colour / logo from
// /api/content (Admin → Settings → Gym Profile) and applies it without any
// per-gym code change. Fetched once and cached for the session.
import { useEffect, useState } from 'react';
import { apiFetch } from './api.js';

let cache = null;
let inflight = null;

function hexToRgba(hex, a) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function applyBranding(b) {
  if (!b || typeof document === 'undefined') return;
  if (b.accent_color) {
    const root = document.documentElement;
    root.style.setProperty('--accent', b.accent_color);
    const soft = hexToRgba(b.accent_color, 0.15);
    if (soft) root.style.setProperty('--accent-soft', soft);
  }
  if (b.name) document.title = b.name;
}

/** Fetch + apply branding once; safe to call from multiple places. */
export function loadBranding() {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = apiFetch('/content', { auth: false })
      .then((c) => {
        cache = c?.branding || {};
        applyBranding(cache);
        return cache;
      })
      .catch(() => ({}));
  }
  return inflight;
}

/** React hook for components that want to render branded text/logo. */
export function useBranding() {
  const [b, setB] = useState(cache || {});
  useEffect(() => {
    loadBranding().then(setB);
  }, []);
  return b;
}
