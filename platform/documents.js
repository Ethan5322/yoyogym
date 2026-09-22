// Application documents — what a gym owner sends us to be reviewed.
//
// The bytes DO NOT pass through the serverless function. The server issues a
// signed upload target and the browser sends the file straight to Supabase
// Storage. Three reasons, in order of how much trouble they save:
//
//   1. Vercel caps a function's request body at roughly 4.5 MB. A scanned
//      business registration goes over that routinely.
//   2. No multipart parser. Hand-written multipart parsing is a classic source
//      of vulnerabilities, and pulling in a dependency for one form is worse.
//   3. A function that never holds the bytes cannot leak them.
//
// What it moves, rather than removes, is trust: the client now says what it is
// uploading and where it put it. So the SERVER decides the path, and verifies
// on the way back in. Everything in this file exists for that reason.
import { randomBytes } from 'node:crypto';

/** 10 MB. Large enough for a scanned multi-page PDF; not a video. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/**
 * Documents and images only.
 *
 * No SVG: it is an image to a human and a script to a browser, and these files
 * are opened by staff on the review screen.
 */
export const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
];

/** What we ask for. A type outside this list is refused, never filed as "other". */
export const DOCUMENT_TYPES = [
  'business_registration',
  'id_document',
  'proof_of_address',
  'tax_clearance',
  'insurance',
  'lease_agreement',
  'other_supporting',
];

/** The private bucket. Nothing in it is ever served publicly. */
export const DOCUMENT_BUCKET = process.env.PLATFORM_DOCUMENT_BUCKET || 'gym-applications';

const EXTENSION = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

/** An application id must be a plain identifier before it goes in a path. */
const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;

/**
 * Where a document goes.
 *
 * Built ONLY from values the server controls: the application id it has just
 * verified the owner owns, the document type it has just checked against a
 * fixed list, an extension derived from the MIME type, and 16 random bytes.
 *
 * THE FILENAME IS NOT USED. A filename is attacker-controlled text, and
 * "../../another-application/id.pdf" in a storage path is a cross-tenant
 * write. The original name is kept as a column, for humans, not as a path.
 *
 * The random component also means a second upload of the same document type
 * never silently overwrites the first.
 */
export function storagePathFor(applicationId, docType, extension) {
  if (!SAFE_ID.test(String(applicationId || ''))) {
    throw new Error(`Unsafe application id: ${applicationId}`);
  }
  if (!DOCUMENT_TYPES.includes(docType)) {
    throw new Error(`Unknown document type: ${docType}`);
  }
  const ext = /^[a-z0-9]{1,5}$/.test(String(extension || '')) ? extension : 'bin';
  return `applications/${applicationId}/${docType}/${randomBytes(16).toString('hex')}.${ext}`;
}

/** Does this path belong to this application? The check on the way back in. */
export function pathBelongsTo(path, applicationId) {
  if (!SAFE_ID.test(String(applicationId || ''))) return false;
  const value = String(path || '');

  // Traversal is rejected outright rather than normalised away. A path
  // containing ".." is not a path we issued, whatever it resolves to.
  if (value.includes('..') || value.includes('\\')) return false;

  return value.startsWith(`applications/${applicationId}/`);
}

/**
 * Validate what the client says it wants to upload.
 *
 * Size and MIME type are CLAIMS at this point — the browser supplies both, and
 * a determined client can lie. They are checked anyway, because they stop
 * every honest mistake, and the bucket's own limits are the backstop for the
 * rest. What is NOT trusted is the path, which is why the server builds it.
 *
 * @returns {{ok: true, path: string} | {ok: false, error: string}}
 */
export function validateUploadRequest({ applicationId, docType, mimeType, sizeBytes }) {
  if (!DOCUMENT_TYPES.includes(docType)) {
    return { ok: false, error: 'Please choose one of the listed document types.' };
  }

  if (!ALLOWED_DOCUMENT_TYPES.includes(mimeType)) {
    return { ok: false, error: 'Please upload a PDF or a photo (JPEG, PNG, WebP or HEIC).' };
  }

  const size = Number(sizeBytes);
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, error: 'That file appears to be empty.' };
  }
  if (size > MAX_DOCUMENT_BYTES) {
    return {
      ok: false,
      error: `That file is larger than ${Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024)} MB. Please send a smaller scan.`,
    };
  }

  try {
    return { ok: true, path: storagePathFor(applicationId, docType, EXTENSION[mimeType]) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * The row recorded after a successful upload.
 *
 * `status` is always 'pending'. Nothing an owner uploads is accepted by the
 * act of uploading it — a person reviews it, which is the entire point of
 * asking for documents (D-048).
 */
export function documentRow({ applicationId, docType, storageRef, filename, mimeType, sizeBytes }) {
  return {
    application_id: applicationId,
    doc_type: docType,
    storage_ref: storageRef,
    // Kept for a human to read, never used to build a path.
    filename: String(filename || '').slice(0, 255),
    mime_type: mimeType,
    size_bytes: Number(sizeBytes) || null,
    status: 'pending',
    uploaded_at: new Date().toISOString(),
  };
}
