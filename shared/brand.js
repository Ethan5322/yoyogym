// The Yoyo Gyms brand — the SINGLE source of truth for its colours and logo.
//
// Shared by the gym's web app (screens, ID cards, PDFs), the server (emails,
// the document endpoint) and the platform website (panel, owner pages, the
// owner agreement PDF). No DOM, no Node APIs. CLAUDE.md §37.
//
// A gym can still choose its OWN colour and logo in Settings → Gym Profile,
// and that choice wins everywhere (§37.1 Q2). These are the defaults for a
// gym that has not chosen, and the look of Yoyo's own surfaces.

export const BRAND = Object.freeze({
  lime: '#BFF642', // the one accent
  limeInk: '#0B1400', // text on lime
  ground: '#070C10', // near-black page
  surface: '#10181D', // cards on the ground
  raise: '#172026', // raised surfaces
  navy: '#04162B', // the logo, on light backgrounds
  purple: '#6047A2', // the logo, on light backgrounds
  purpleOnDark: '#8C65C8', // the logo, on dark backgrounds
});

/** What a gym gets when it has not chosen a colour. */
export const DEFAULT_ACCENT = BRAND.lime;

/** The logo, served from /public/brand. On dark screens and on white paper. */
export const LOGO_ON_DARK = '/brand/yoyo-gyms-logo-on-dark.png';
export const LOGO_ON_LIGHT = '/brand/yoyo-gyms-logo-on-light.png';
/** Width ÷ height of both logo files. */
export const LOGO_ASPECT = 720 / 531;

/** `#RRGGBB` → [r, g, b], or null for anything that is not one. */
export function hexToRgb(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A gym's colour if it is a real `#RRGGBB`, otherwise the Yoyo default. */
export function accentOrDefault(hex) {
  return hexToRgb(hex) ? `#${String(hex).trim().replace(/^#/, '').toUpperCase()}` : DEFAULT_ACCENT;
}

/** WCAG relative luminance, 0 (black) … 1 (white). */
export function luminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours, 1 … 21. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The text colour to put ON an accent. White, as buttons have always had,
 * unless white is too faint to read on it — under 3:1, the WCAG minimum for
 * large text — as on the Yoyo lime; then the dark ink. So a gym's red keeps
 * its white text, and no gym's colour can make its buttons unreadable.
 */
export function inkOn(hex) {
  const accent = accentOrDefault(hex);
  return contrast(accent, '#FFFFFF') >= 3 ? '#FFFFFF' : BRAND.limeInk;
}

/**
 * The accent as TEXT on white paper. Lime on white is unreadable, so a light
 * accent is swapped for the logo's navy; a dark accent (a gym's red) is kept.
 * A light accent still works as a band or a rule — just not as letters.
 */
export function printInk(hex) {
  const accent = accentOrDefault(hex);
  return contrast(accent, '#FFFFFF') >= 3 ? accent : BRAND.navy;
}

/** A darker shade of the accent, for the far end of a gradient. */
export function deepen(hex, amount = 0.2) {
  const [r, g, b] = hexToRgb(accentOrDefault(hex));
  const d = (v) => Math.round(v * (1 - amount)).toString(16).padStart(2, '0');
  return `#${d(r)}${d(g)}${d(b)}`.toUpperCase();
}
