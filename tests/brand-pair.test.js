// A gym's colour with words on it reads at 4.5:1 (design critique 2026-09-29),
// and the app's copy of the rule is the website's rule, colour for colour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { BRAND, accentPair, contrast, hexToRgb } from '../shared/brand.js';

const sweep = [];
for (let r = 0; r <= 255; r += 51) for (let g = 0; g <= 255; g += 51) for (let b = 0; b <= 255; b += 51) {
  sweep.push(`#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase());
}
sweep.push('#E63946', '#BFF642', '#F28C28', '#1D4ED8', '#FF0000', '#00AA00');

test('every colour, with its ink, reads at 4.5:1 or better', () => {
  for (const c of sweep) {
    const { accent, ink } = accentPair(c);
    assert.ok(contrast(accent, ink) >= 4.5, `${c} -> ${accent} with ${ink}`);
  }
});

test('the Yoyo lime and a colour that already passes come back unchanged', () => {
  assert.deepEqual(accentPair(BRAND.lime), { accent: BRAND.lime, ink: BRAND.limeInk });
  assert.deepEqual(accentPair('#1D4ED8'), { accent: '#1D4ED8', ink: '#FFFFFF' });
});

test('a red gym keeps white on red; the red only deepens a shade', () => {
  const { accent, ink } = accentPair('#E63946');
  assert.equal(ink, '#FFFFFF');
  const [r0, g0, b0] = hexToRgb('#E63946');
  const [r, g, b] = hexToRgb(accent);
  for (const [was, now] of [[r0, r], [g0, g], [b0, b]]) assert.ok(now <= was && now >= was * 0.9, `${accent}`);
});

test("the app's copy of the rule gives the same answer for every colour", () => {
  const read = (f) => readFileSync('apps/mobile/www/' + f, 'utf8');
  const dom = new JSDOM(read('index.html').replace(/<script src="[^"]+"><\/script>/g, ''), {
    url: 'https://localhost/',
    runScripts: 'outside-only',
  });
  for (const f of ['config.js', 'member.js']) dom.window.eval(read(f));
  const app = dom.window.YOYO_BRAND;
  for (const c of sweep) {
    const mine = app.accentPair(c);
    assert.deepEqual({ accent: mine.accent, ink: mine.ink }, accentPair(c), c);
  }
});
