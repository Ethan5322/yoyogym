// Draw the app's icon and splash SOURCES from the Yoyo Gym brand mark.
//
// The mark is public/icon.svg — the red dumbbell the gym's web app already
// uses. The shipped app carried Capacitor's placeholder icon instead: a blue
// cross on a grid, which is the first thing a store reviewer and a gym member
// would see.
//
// This writes the four sources `@capacitor/assets` expects, into
// apps/mobile/assets/. Then `npm run mobile:icons` renders every size Android
// (and later iOS) needs from them.
//
//   icon-only.png        1024  full-bleed square — stores round the corners
//                              themselves, and iOS refuses transparency
//   icon-foreground.png  1024  the dumbbell alone, inside Android's adaptive
//                              safe zone, so no launcher shape clips it
//   icon-background.png  1024  the plain ground behind the foreground
//   splash.png           2732  the mark centred on the app's own dark ground
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE = join(HERE, '..', '..', 'apps', 'mobile');
// sharp arrives with @capacitor/assets, inside the mobile project.
const sharp = createRequire(join(MOBILE, 'package.json'))('sharp');

const RED = '#E63946';
const ICON_GROUND = '#0A0A0A'; // public/icon.svg's own background
const APP_GROUND = '#0e1416'; // the app's screens

/**
 * The dumbbell from public/icon.svg, on its original 512 grid. It spans
 * x 96-416 and y 196-316, so its centre is (256, 256).
 */
const DUMBBELL = `
  <line x1="150" y1="256" x2="362" y2="256" stroke="${RED}" stroke-width="34" stroke-linecap="round"/>
  <rect x="96" y="196" width="44" height="120" rx="16" fill="${RED}"/>
  <rect x="372" y="196" width="44" height="120" rx="16" fill="${RED}"/>
  <rect x="140" y="216" width="34" height="80" rx="12" fill="${RED}"/>
  <rect x="338" y="216" width="34" height="80" rx="12" fill="${RED}"/>`;

/** The dumbbell, scaled about the centre of a `size` canvas. */
function mark(size, scale, ground) {
  const s = (size / 512) * scale;
  const offset = (size - 512 * s) / 2;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      (ground ? `<rect width="${size}" height="${size}" fill="${ground}"/>` : '') +
      `<g transform="translate(${offset} ${offset}) scale(${s})">${DUMBBELL}</g>` +
      `</svg>`
  );
}

const out = join(MOBILE, 'assets');
mkdirSync(out, { recursive: true });

// Full icon: the mark at its original proportion on its own ground.
await sharp(mark(1024, 1, ICON_GROUND)).png().toFile(join(out, 'icon-only.png'));

// Adaptive foreground: Android shows only the central 66% of a 108dp icon for
// certain, so the dumbbell (62.5% of its box wide) is scaled to sit inside it.
await sharp(mark(1024, 0.85, null)).png().toFile(join(out, 'icon-foreground.png'));
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: ICON_GROUND } })
  .png()
  .toFile(join(out, 'icon-background.png'));

// Splash: small and centred — a splash is a pause, not a poster.
await sharp(mark(2732, 0.35, APP_GROUND)).png().toFile(join(out, 'splash.png'));
await sharp(mark(2732, 0.35, APP_GROUND)).png().toFile(join(out, 'splash-dark.png'));

console.log('Wrote apps/mobile/assets/{icon-only,icon-foreground,icon-background,splash,splash-dark}.png');
