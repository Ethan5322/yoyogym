// Server-side client for the InsightFace (ArcFace + RetinaFace) microservice.
// The browser never calls it directly — our Node API proxies, so FACE_API_KEY
// stays secret and face login works for unauthenticated members on any phone.
//
// Matching thresholds and gallery logic live in ./facematch.js; this module is
// only the transport plus the image-quality gate.
//
// Configure on Vercel (Project → Settings → Environment Variables):
//   FACE_SERVICE_URL   e.g. https://you-yoyogym-face.hf.space
//   FACE_API_KEY       (optional) must match the service's FACE_API_KEY
const URL_BASE = (process.env.FACE_SERVICE_URL || '').replace(/\/+$/, '');
const API_KEY = process.env.FACE_API_KEY || undefined;

// A template is only as good as the frame it came from. Enrolment writes a
// template the member lives with for months, so it is gated harder than a login
// probe, which the member can simply retry.
export const ENROL_MIN_DET_SCORE = Number(process.env.FACE_ENROL_MIN_SCORE || 0.62);

export function faceServiceConfigured() {
  return !!URL_BASE;
}

async function post(path, body, timeoutMs = 20000) {
  const r = await fetch(`${URL_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, api_key: API_KEY }),
    // generous timeout: the first call may cold-start the Space
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || !data?.ok) return null;
  return data;
}

/**
 * Embed one image. Returns the 512-D L2-normalised ArcFace embedding plus the
 * quality signals a caller needs to decide whether to trust it — or null when
 * no face was found or the service is unreachable.
 *
 * @returns {Promise<{embedding: number[], detScore: number, faces: number} | null>}
 */
export async function embedFaceDetailed(image) {
  if (!URL_BASE || !image) return null;
  try {
    const data = await post('/embed', { image });
    if (!Array.isArray(data?.embedding)) return null;
    return {
      embedding: data.embedding,
      detScore: Number(data.det_score ?? 0),
      faces: Number(data.faces ?? 1),
    };
  } catch (err) {
    console.error('face service embed error:', err.message);
    return null;
  }
}

/** Embed one image, returning just the embedding (or null). */
export async function embedFace(image) {
  const r = await embedFaceDetailed(image);
  return r ? r.embedding : null;
}

/**
 * Embed several enrolment frames in one round trip, keeping only those good
 * enough to become permanent templates. The frames are expected to be different
 * poses of the same person: that spread is what later makes a new hairstyle,
 * beard or face of makeup recoverable.
 *
 * @returns {Promise<number[][]>} accepted embeddings, best quality first
 */
export async function embedEnrolmentImages(images) {
  const list = (images || []).filter((i) => typeof i === 'string' && i.startsWith('data:image'));
  if (!URL_BASE || !list.length) return [];
  try {
    const data = await post('/embed-batch', { images: list }, 40000);
    const results = Array.isArray(data?.results) ? data.results : [];
    return results
      .filter((r) => r?.ok && Array.isArray(r.embedding) && Number(r.det_score ?? 0) >= ENROL_MIN_DET_SCORE)
      .sort((a, b) => Number(b.det_score) - Number(a.det_score))
      .map((r) => r.embedding);
  } catch (err) {
    console.error('face service embed-batch error:', err.message);
    return [];
  }
}
