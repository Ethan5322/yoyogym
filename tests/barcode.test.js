// Unit tests for the Code 128 encoder used on ID-card barcodes.
// A single typo in the symbol table would silently produce an unscannable
// barcode, so the structural invariants of the table are asserted here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CODE128_PATTERNS, code128BSymbols, code128BModules } from '../src/lib/barcode.js';

test('symbol table has 107 entries', () => {
  assert.equal(CODE128_PATTERNS.length, 107);
});

test('symbols 0-105 are 6 elements summing to 11 modules', () => {
  for (let i = 0; i <= 105; i++) {
    const p = CODE128_PATTERNS[i];
    assert.equal(p.length, 6, `symbol ${i} has ${p.length} elements`);
    const sum = [...p].reduce((s, d) => s + Number(d), 0);
    assert.equal(sum, 11, `symbol ${i} sums to ${sum}`);
  }
});

test('stop symbol is 7 elements summing to 13 modules', () => {
  const stop = CODE128_PATTERNS[106];
  assert.equal(stop, '2331112');
  assert.equal([...stop].reduce((s, d) => s + Number(d), 0), 13);
});

test('every symbol pattern is unique', () => {
  assert.equal(new Set(CODE128_PATTERNS).size, CODE128_PATTERNS.length);
});

test('encodes start B, data, checksum and stop', () => {
  // "A" -> START_B(104), 'A'=65-32=33, checksum (104 + 33*1) % 103 = 34, STOP(106)
  assert.deepEqual(code128BSymbols('A'), [104, 33, 34, 106]);
});

test('checksum weights each data symbol by its 1-based position', () => {
  // "AB" -> 104 + 33*1 + 34*2 = 205; 205 % 103 = 102
  assert.deepEqual(code128BSymbols('AB'), [104, 33, 34, 102, 106]);
});

test('a verification code encodes to bars starting and ending with a bar', () => {
  const bits = code128BModules('K7QM4XPT');
  assert.equal(bits[0], '1');
  assert.equal(bits.at(-1), '1');
  // 11 modules each for start + 8 data + checksum, 13 for stop.
  assert.equal(bits.length, 10 * 11 + 13);
});

test('rejects characters outside Code 128 subset B', () => {
  assert.throws(() => code128BSymbols('ABC\n'), /cannot be encoded/);
  assert.throws(() => code128BSymbols(''), /empty/);
});
