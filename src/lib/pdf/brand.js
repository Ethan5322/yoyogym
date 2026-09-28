// The brand on every PDF and ID card (CLAUDE.md §37).
//
// One header treatment for all documents: a near-black band, white type, the
// logo on the right and a stripe of the gym's accent beneath it. It reads
// whatever colour a gym chose — lime, a gym's red, anything — because the
// words never sit on the accent itself. On white paper the accent is used
// for stripes and bars; accent TEXT goes through printInk(), which swaps a
// light accent (lime) for the logo's navy.
//
// THE LOGO is always the Yoyo Gyms logo; the gym's own name is printed with
// it (§37.1 Q7). The gym's own icon is for what its members see on screen.
import { BRAND, accentOrDefault, hexToRgb, inkOn, printInk } from '../../../shared/brand.js';
import { YOYO_LOGO_ON_DARK, YOYO_LOGO_ON_LIGHT, YOYO_LOGO_ASPECT } from '../../../shared/yoyo-logo.js';

/** [r, g, b] for jsPDF's colour setters. */
export const rgb = (hex) => hexToRgb(hex) || hexToRgb(BRAND.lime);

/** Every colour a document needs, from the gym's accent. */
export function documentColours(accent) {
  const a = accentOrDefault(accent);
  return {
    accent: rgb(a), // stripes, bars, fills
    onAccent: rgb(inkOn(a)), // text on those fills
    text: rgb(printInk(a)), // accent-coloured words on white paper
    ground: rgb(BRAND.ground), // the header band
  };
}

// ---------------------------------------------------------------------------
// The logo
// ---------------------------------------------------------------------------

/**
 * The logo for a document: ALWAYS the Yoyo Gyms logo, with the gym's own name
 * printed beside it (CLAUDE.md §37.1 Q7 — "IDs and PDFs keep the Yoyo Gyms
 * logo"). `surface` is what it sits on: 'dark' (the header band, the ID card)
 * or 'light' (white paper).
 * @returns {{ data: string, aspect: number, format: string, own: boolean }}
 */
export function documentLogo(surface = 'dark') {
  return {
    data: surface === 'light' ? YOYO_LOGO_ON_LIGHT : YOYO_LOGO_ON_DARK,
    aspect: YOYO_LOGO_ASPECT,
    format: 'PNG',
    own: false,
  };
}

// ---------------------------------------------------------------------------
// The header band
// ---------------------------------------------------------------------------

/**
 * Draw the branded header band across the top of the CURRENT page, `height`
 * tall in the document's own units (pt or mm). The caller then writes its own
 * white title text over it, where it always has.
 *
 * @param {object} o
 * @param {string} o.accent  the gym's colour (or anything; lime if not a colour)
 * @param {number} o.height  band height, in document units
 * @param {number} o.margin  right-hand margin for the logo, in document units
 * @param {number} [o.stripe] accent stripe thickness; 7% of the band if omitted
 */
export function brandBand(doc, { accent, height, margin, stripe = height * 0.07 }) {
  const W = doc.internal.pageSize.getWidth();
  const c = documentColours(accent);

  doc.setFillColor(...c.ground);
  doc.rect(0, 0, W, height - stripe, 'F');
  doc.setFillColor(...c.accent);
  doc.rect(0, height - stripe, W, stripe, 'F');

  // The logo, right-aligned and vertically centred in the dark part.
  const logo = documentLogo('dark');
  const lh = (height - stripe) * 0.62;
  const lw = lh * logo.aspect;
  const lx = W - margin - lw;
  const ly = (height - stripe - lh) / 2;
  if (logo.own) {
    // A gym's own logo may be dark on transparent: give it a white tile so it
    // shows on the band whatever its colours.
    const pad = lh * 0.12;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(lx - pad, ly - pad, lw + pad * 2, lh + pad * 2, pad, pad, 'F');
  }
  doc.addImage(logo.data, logo.format, lx, ly, lw, lh, undefined, 'FAST');

  // Where the logo landed, so a caller's own header text can stay clear of it.
  return { ...c, logoBox: { x: lx, y: ly, w: lw, h: lh } };
}
