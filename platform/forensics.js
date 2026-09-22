// Facts about an uploaded file, for a person deciding whether it is genuine.
//
//   >>> NOTHING HERE DECIDES ANYTHING. <<<
//
// Every function returns facts and flags. A reviewer weighs them. Automatic
// rejection on a heuristic would turn away real gyms with old scanners and
// unusual phone cameras, and the cost of that is a real business losing a day
// to an appeal because a file was 40 KB.
//
// What these checks can honestly tell a reviewer:
//   · what the file ACTUALLY is, from its bytes rather than its name
//   · whether that matches what the browser claimed
//   · a hash, so the same document turning up on two applications is visible
//   · whether it is too small to contain anything
//
// What they cannot tell anyone: whether the content is true. A genuine-looking
// PDF of a forged registration certificate passes every check here. That is
// why a human reads every application (D-048), and why this file exists to
// help them look rather than to look for them.
import { createHash } from 'node:crypto';

/** Flag codes, named so a screen and a test refer to the same thing. */
export const FORENSIC_FLAGS = {
  TYPE_MISMATCH: 'type_mismatch',
  TOO_SMALL: 'too_small',
  SIZE_MISMATCH: 'size_mismatch',
};

/** Under this, a scan holds no readable document. 20 KB is generous. */
const MIN_PLAUSIBLE_BYTES = 20 * 1024;

/**
 * Magic numbers — the first bytes that identify a format.
 *
 * Taken from the formats' own specifications, not from a library, because the
 * list is short and a dependency for eight byte-comparisons is a dependency to
 * keep updated forever.
 */
const SIGNATURES = [
  { type: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF8
  // Not accepted for upload, but worth NAMING when one turns up: "this is a
  // zip" tells a reviewer far more than "unrecognised".
  { type: 'application/zip', bytes: [0x50, 0x4b, 0x03, 0x04] },
  { type: 'application/x-msdownload', bytes: [0x4d, 0x5a] }, // MZ — a Windows exe
];

/** WEBP and HEIC carry their marker a few bytes in, not at the very start. */
function sniffContainer(buffer) {
  if (buffer.length < 12) return null;
  const brand = buffer.subarray(8, 12).toString('latin1');

  if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && brand === 'WEBP') return 'image/webp';
  if (buffer.subarray(4, 8).toString('latin1') === 'ftyp' && /hei|mif1|msf1/.test(brand)) {
    return 'image/heic';
  }
  return null;
}

/**
 * What is this file, really?
 *
 * @returns {string|null} a media type, or null when the bytes are not
 *   recognised. NULL IS NOT A GUESS — saying "probably a PDF" about unknown
 *   bytes would be worse than saying nothing, because a reviewer would believe
 *   it.
 */
export function sniffType(buffer) {
  if (!buffer || buffer.length < 2) return null;

  for (const { type, bytes } of SIGNATURES) {
    if (buffer.length < bytes.length) continue;
    if (bytes.every((b, i) => buffer[i] === b)) return type;
  }

  return sniffContainer(buffer);
}

/**
 * Do the bytes agree with what the browser said it was uploading?
 *
 * An unrecognised file is NOT treated as a mismatch — plenty of legitimate
 * formats are not in the list above, and flagging every one of them would make
 * the flags meaningless. It is only a mismatch when the file is recognised and
 * is recognised as something else.
 */
export function typeMatchesDeclared(buffer, declaredType) {
  const actual = sniffType(buffer);
  if (!actual) return true;
  return actual === declaredType;
}

/**
 * Everything a reviewer should be told about the bytes.
 *
 * @param {Buffer} buffer the file as it is actually stored
 * @param {object} declared what the upload claimed: { declaredType, declaredSize }
 */
export function fileFacts(buffer, { declaredType = null, declaredSize = null } = {}) {
  const bytes = buffer?.length ?? 0;
  const actualType = sniffType(buffer);
  const flags = [];

  if (declaredType && actualType && actualType !== declaredType) {
    flags.push({
      code: FORENSIC_FLAGS.TYPE_MISMATCH,
      severity: 'high',
      detail: `Uploaded as ${declaredType}, but the file is actually ${actualType}.`,
    });
  }

  if (bytes > 0 && bytes < MIN_PLAUSIBLE_BYTES) {
    flags.push({
      code: FORENSIC_FLAGS.TOO_SMALL,
      severity: 'medium',
      detail: `Only ${Math.round(bytes / 1024)} KB — too small to be a readable scan of a document.`,
    });
  }

  if (Number.isFinite(Number(declaredSize)) && Number(declaredSize) !== bytes) {
    flags.push({
      code: FORENSIC_FLAGS.SIZE_MISMATCH,
      severity: 'medium',
      detail: `The upload said ${Number(declaredSize)} bytes; storage holds ${bytes}.`,
    });
  }

  return {
    sha256: createHash('sha256').update(buffer ?? Buffer.alloc(0)).digest('hex'),
    bytes,
    actualType,
    declaredType,
    flags,
  };
}

/** Bytes as a person reads them. */
export function readableSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
