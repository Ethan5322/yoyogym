// Draw the app's icon and splash SOURCES from the Yoyo Gyms logo.
//
// The logo is the user's own (CLAUDE.md §37): public/brand/yoyo-gyms-logo-on-
// dark.png, white + purple, made for the near-black ground. It replaced the
// red dumbbell (the old public/icon.svg) on 2026-09-28.
//
// The user asked for the logo on a TRANSPARENT background (§37.1 Q4). The
// stores decide what is possible: Apple rejects any App Store icon with
// transparency, and Android masks every launcher icon into a shape over its
// background layer. So the logo keeps a transparent background where a store
// allows one — the adaptive FOREGROUND layer — and sits on the brand's solid
// near-black where it must.
//
// This writes the sources `@capacitor/assets` expects, into apps/mobile/assets/.
// Then `npm run mobile:icons` renders every size Android and iOS need.
//
//   icon-only.png        1024  the MARK on solid near-black — iOS refuses
//                              transparency, and the stores round the corners
//   icon-foreground.png  1024  the MARK alone, TRANSPARENT, inside Android's
//                              adaptive safe zone, so no launcher shape clips it
//   icon-background.png  1024  the plain near-black behind the foreground
//   splash.png           2732  the whole logo centred on the app's own ground
//
// THE ICON IS THE MARK ONLY — the figure and the barbell, without "YOYO GYMS"
// or "LIFT • TRAIN • TRANSFORM" (CLAUDE.md §50: the lettering, shrunk to a
// launcher icon, looked unprofessional). The app's name already sits under
// its icon on every phone. The splash keeps the whole logo.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { BRAND } from '../../shared/brand.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const MOBILE = join(ROOT, 'apps', 'mobile');
// sharp arrives with @capacitor/assets, inside the mobile project.
const sharp = createRequire(join(MOBILE, 'package.json'))('sharp');

const LOGO = join(ROOT, 'public', 'brand', 'yoyo-gyms-logo-on-dark.png');
const GROUND = BRAND.ground;

/**
 * The logo's mark: everything above the first clear horizontal gap below it.
 *
 * Measured on the logo of 2026-09-28: the mark runs to row 393 of 531, then
 * 21 transparent rows, then "YOYO GYMS" (415–488) and the line beneath it.
 * Found from the pixels rather than written in, so a redrawn logo with the
 * same layout still gives its mark.
 */
async function markOnly() {
  const { data, info } = await sharp(LOGO).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const inked = (y) => {
    for (let x = 0; x < info.width; x += 1) if (data[(y * info.width + x) * 4 + 3] > 40) return true;
    return false;
  };
  // The first run of 12+ clear rows after the top third: the gap under the mark.
  let clear = 0;
  let cut = info.height;
  for (let y = Math.floor(info.height / 3); y < info.height; y += 1) {
    clear = inked(y) ? 0 : clear + 1;
    if (clear >= 12) { cut = y - clear + 1; break; }
  }
  if (cut >= info.height) throw new Error('No gap found under the mark: check the logo before making icons.');
  // Two steps: sharp trims BEFORE it extracts when both are chained.
  const top = await sharp(LOGO).extract({ left: 0, top: 0, width: info.width, height: cut }).png().toBuffer();
  return sharp(top).trim().png().toBuffer();
}

/**
 * A `size` square with `art` (the whole logo by default) centred at `width` ×
 * size wide, on `ground` (or transparent when `ground` is null).
 */
async function compose(size, width, ground, art = LOGO) {
  const logo = await sharp(art).resize({ width: Math.round(size * width) }).png().toBuffer();
  const base = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: ground ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });
  return base.composite([{ input: logo, gravity: 'centre' }]).png();
}

const out = join(MOBILE, 'assets');
mkdirSync(out, { recursive: true });

const MARK = await markOnly();

// Full icon: the mark large on solid near-black.
await (await compose(1024, 0.72, GROUND, MARK)).toFile(join(out, 'icon-only.png'));

// Adaptive foreground: Android shows only a central circle 66/108 of the icon
// for certain. The mark is about 1.6 times wider than tall, so at half the
// width its corners still fall inside that circle, whatever shape the
// launcher cuts.
await (await compose(1024, 0.5, null, MARK)).toFile(join(out, 'icon-foreground.png'));
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: GROUND } })
  .png()
  .toFile(join(out, 'icon-background.png'));

// Splash: modest and centred — a splash is a pause, not a poster.
await (await compose(2732, 0.34, GROUND)).toFile(join(out, 'splash.png'));
await (await compose(2732, 0.34, GROUND)).toFile(join(out, 'splash-dark.png'));

console.log('Wrote apps/mobile/assets/{icon-only,icon-foreground,icon-background,splash,splash-dark}.png');
