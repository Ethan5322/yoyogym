// Code 128 (subset B) barcode encoder + canvas renderer.
//
// Used to print a member's / staff member's verification code on their ID card
// as a machine-readable barcode, so a reception scanner reads the same code the
// human-readable text shows. Pure encoding is separated from drawing so the
// symbol table can be unit-tested (tests/barcode.test.js).
//
// Code 128 B covers ASCII 32–126, which includes the whole verification-code
// alphabet (uppercase letters + digits).

// The 107 Code 128 symbols. Each entry lists the widths of its elements,
// alternating bar, space, bar, space, bar, space (values 0–105 are 6 elements
// summing to 11 modules; the stop symbol 106 has 7 elements summing to 13).
export const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232', '2331112',
];

const START_B = 104;
const STOP = 106;

/** Symbol values for `value` in subset B: START B, data, checksum, STOP. */
export function code128BSymbols(value) {
  const text = String(value ?? '');
  if (!text) throw new Error('Barcode value is empty.');

  const symbols = [START_B];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) {
      throw new Error(`Character "${ch}" cannot be encoded in Code 128 subset B.`);
    }
    symbols.push(code - 32);
  }

  // Checksum: start value (weight 1) plus each data value times its 1-based
  // position, modulo 103.
  let sum = symbols[0];
  for (let i = 1; i < symbols.length; i++) sum += symbols[i] * i;
  symbols.push(sum % 103);
  symbols.push(STOP);
  return symbols;
}

/** Module string for `value`: '1' = bar, '0' = space. Each symbol starts on a bar. */
export function code128BModules(value) {
  let bits = '';
  for (const symbol of code128BSymbols(value)) {
    const pattern = CODE128_PATTERNS[symbol];
    for (let i = 0; i < pattern.length; i++) {
      bits += (i % 2 === 0 ? '1' : '0').repeat(Number(pattern[i]));
    }
  }
  return bits;
}

/**
 * Draw a Code 128 B barcode into a canvas context, scaled to fit `width`.
 * A white quiet zone surrounds the bars — scanners need it to lock on.
 */
export function drawBarcode(ctx, value, { x, y, width, height, quietZone = 10, background = '#FFFFFF', foreground = '#000000' }) {
  const bits = code128BModules(value);
  const drawable = width - quietZone * 2;
  const module = drawable / bits.length;

  ctx.save();
  ctx.fillStyle = background;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = foreground;
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] !== '1') continue;
    // Extend each bar by a hair so neighbouring modules never leave a seam
    // from sub-pixel rounding.
    ctx.fillRect(x + quietZone + i * module, y, module + 0.5, height);
  }
  ctx.restore();
}
