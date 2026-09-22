// What a reviewer needs in order to spot a forged document.
//
// Before this, opening a document redirected out of the panel to a signed
// storage URL. The reviewer left the screen, downloaded a file, and had
// nothing to compare it against — no applicant details, no file facts, and no
// way to know they had seen the same file on someone else's application last
// week.
//
// These are the checks that can be made honestly from the file itself. None of
// them decides anything: they hand a person facts, and the person decides.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sniffType, typeMatchesDeclared, fileFacts, FORENSIC_FLAGS } from '../platform/forensics.js';

// Real magic bytes, not invented ones.
const PDF = Buffer.from('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n', 'binary');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const EXE = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);

// ---------------------------------------------------------------------------
// What the file actually is
// ---------------------------------------------------------------------------

test('a real PDF, JPEG and PNG are recognised by their bytes', () => {
  assert.equal(sniffType(PDF), 'application/pdf');
  assert.equal(sniffType(JPEG), 'image/jpeg');
  assert.equal(sniffType(PNG), 'image/png');
});

test('AN EXECUTABLE RENAMED TO .pdf IS CAUGHT', () => {
  // The oldest trick there is. The upload check trusts the browser's declared
  // type; this one reads what the file actually starts with.
  assert.equal(sniffType(EXE), 'application/x-msdownload');
  assert.equal(typeMatchesDeclared(EXE, 'application/pdf'), false);
});

test('a zip renamed to .pdf is caught', () => {
  assert.equal(typeMatchesDeclared(ZIP, 'application/pdf'), false);
});

test('a file whose bytes match its declared type passes', () => {
  assert.equal(typeMatchesDeclared(PDF, 'application/pdf'), true);
  assert.equal(typeMatchesDeclared(JPEG, 'image/jpeg'), true);
});

test('an unrecognised file is reported as unknown, not guessed at', () => {
  // Saying "probably a PDF" about bytes we do not recognise would be worse
  // than saying nothing — a reviewer would trust it.
  assert.equal(sniffType(Buffer.from('just some text')), null);
});

// ---------------------------------------------------------------------------
// The facts a reviewer is given
// ---------------------------------------------------------------------------

test('the facts include a hash, computed from the bytes we actually hold', () => {
  const facts = fileFacts(PDF, { declaredType: 'application/pdf', declaredSize: PDF.length });

  assert.match(facts.sha256, /^[a-f0-9]{64}$/);
  assert.equal(facts.bytes, PDF.length);
  assert.equal(facts.actualType, 'application/pdf');
});

test('the same file always hashes the same, so duplicates can be found', () => {
  // The strongest fraud signal available: one document on two applications.
  assert.equal(fileFacts(PDF, {}).sha256, fileFacts(Buffer.from(PDF), {}).sha256);
});

test('a different file hashes differently', () => {
  assert.notEqual(fileFacts(PDF, {}).sha256, fileFacts(JPEG, {}).sha256);
});

// ---------------------------------------------------------------------------
// The flags — facts, not verdicts
// ---------------------------------------------------------------------------

test('a mismatched type raises a flag a reviewer can read', () => {
  const facts = fileFacts(EXE, { declaredType: 'application/pdf', declaredSize: EXE.length });

  const flag = facts.flags.find((f) => f.code === FORENSIC_FLAGS.TYPE_MISMATCH);
  assert.ok(flag, 'the mismatch must be flagged');
  assert.match(flag.detail, /pdf/i, 'and say what was claimed');
});

test('a suspiciously tiny file is flagged — a blank scan proves nothing', () => {
  const facts = fileFacts(Buffer.from('%PDF-1.4'), { declaredType: 'application/pdf' });
  assert.ok(facts.flags.some((f) => f.code === FORENSIC_FLAGS.TOO_SMALL));
});

test('a size that disagrees with what was declared is flagged', () => {
  // The browser said one thing and storage holds another.
  const facts = fileFacts(PDF, { declaredType: 'application/pdf', declaredSize: 999999 });
  assert.ok(facts.flags.some((f) => f.code === FORENSIC_FLAGS.SIZE_MISMATCH));
});

test('a clean file raises no flags at all', () => {
  const big = Buffer.concat([PDF, Buffer.alloc(200_000, 0x20)]);
  const facts = fileFacts(big, { declaredType: 'application/pdf', declaredSize: big.length });

  assert.deepEqual(facts.flags, [], 'a normal document must not cry wolf');
});

test('NOTHING HERE DECIDES ANYTHING', () => {
  // Every flag is a fact for a person to weigh. An automatic rejection on a
  // heuristic would reject real gyms with unusual scanners.
  const facts = fileFacts(EXE, { declaredType: 'application/pdf' });

  assert.ok(!('rejected' in facts));
  assert.ok(!('verdict' in facts));
  assert.ok(facts.flags.every((f) => typeof f.detail === 'string'));
});
