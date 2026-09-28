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
//   icon-only.png        1024  the logo on solid near-black — iOS refuses
//                              transparency, and the stores round the corners
//   icon-foreground.png  1024  the logo alone, TRANSPARENT, inside Android's
//                              adaptive safe zone, so no launcher shape clips it
//   icon-background.png  1024  the plain near-black behind the foreground
//   splash.png           2732  the logo centred on the app's own ground
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
 * A `size` square with the logo centred at `width` × size wide, on `ground`
 * (or transparent when `ground` is null).
 */
async function compose(size, width, ground) {
  const logo = await sharp(LOGO).resize({ width: Math.round(size * width) }).png().toBuffer();
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

// Full icon: the logo large on solid near-black.
await (await compose(1024, 0.84, GROUND)).toFile(join(out, 'icon-only.png'));

// Adaptive foreground: Android shows only a central circle 66/108 of the icon
// for certain. The logo is wider than tall, so it is sized to fit INSIDE that
// circle — corners included — whatever shape the launcher cuts.
await (await compose(1024, 0.5, null)).toFile(join(out, 'icon-foreground.png'));
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: GROUND } })
  .png()
  .toFile(join(out, 'icon-background.png'));

// Splash: modest and centred — a splash is a pause, not a poster.
await (await compose(2732, 0.34, GROUND)).toFile(join(out, 'splash.png'));
await (await compose(2732, 0.34, GROUND)).toFile(join(out, 'splash-dark.png'));

console.log('Wrote apps/mobile/assets/{icon-only,icon-foreground,icon-background,splash,splash-dark}.png');
