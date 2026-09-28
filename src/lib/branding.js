// Runtime branding — pulls each gym's name / tagline / accent colour / logo from
// /api/content (Admin → Settings → Gym Profile) and applies it without any
// per-gym code change. Fetched once and cached for the session.
import { useEffect, useState } from 'react';
import { apiFetch } from './api.js';
import { accentOrDefault, hexToRgb, inkOn, deepen } from '../../shared/brand.js';

let cache = null;
let inflight = null;

/**
 * The status a gym-scoped content fetch failed with, if it did.
 *
 * Kept rather than swallowed: resolution answers 404 / 402 / 403 / 503 for
 * four genuinely different situations, and throwing that away is how a member
 * ended up filling in a whole registration form for a gym that was suspended.
 */
let failedStatus = null;

/** What went wrong reaching this gym, or null if nothing did. */
export function brandingFailure() {
  return failedStatus;
}

/**
 * The gym's own colour, with everything that has to match it: the RGB form
 * (so every glow and border follows it), a darker shade for gradients, and
 * the TEXT colour that reads on it (CLAUDE.md §37). With no colour chosen,
 * the stylesheet's own defaults — the Yoyo lime — stay in place.
 */
export function applyBranding(b) {
  if (!b || typeof document === 'undefined') return;
  if (hexToRgb(b.accent_color)) {
    const accent = accentOrDefault(b.accent_color);
    const root = document.documentElement;
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-rgb', hexToRgb(accent).join(' '));
    root.style.setProperty('--accent-soft', `rgb(${hexToRgb(accent).join(' ')} / 0.15)`);
    root.style.setProperty('--accent-deep', deepen(accent));
    root.style.setProperty('--accent-ink', inkOn(accent));
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
        // Fetched now so a PDF made later can carry it (pdf/brand.js). Loaded
        // on demand: the embedded Yoyo logo it brings is no weight for a
        // member who is only registering.
        if (cache.logo_url) {
          import('./pdf/brand.js').then((m) => m.preloadGymLogo(cache.logo_url)).catch(() => {});
        }
        return cache;
      })
      .catch((err) => {
        // Remembered, not hidden. loadBranding() still RESOLVES, so nothing
        // that merely wanted a colour has to learn about error handling.
        failedStatus = err?.status ?? null;
        return {};
      });
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
