// Server-side client for the InsightFace (ArcFace + RetinaFace) microservice.
// The browser never calls it directly — our Node API proxies, so FACE_API_KEY
// stays secret and face login works for unauthenticated members on any phone.
//
// Configure on Vercel (Project → Settings → Environment Variables):
//   FACE_SERVICE_URL   e.g. https://you-yoyogym-face.hf.space
//   FACE_API_KEY       (optional) must match the service's FACE_API_KEY
const URL_BASE = (process.env.FACE_SERVICE_URL || '').replace(/\/+$/, '');
const API_KEY = process.env.FACE_API_KEY || undefined;

export function faceServiceConfigured() {
  return !!URL_BASE;
}

/** Send an image (data-URL or base64) to the service; returns a 512-D
 *  L2-normalised ArcFace embedding (number[]), or null on no-face/error. */
export async function embedFace(image) {
  if (!URL_BASE || !image) return null;
  try {
    const r = await fetch(`${URL_BASE}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, api_key: API_KEY }),
      // generous timeout: first call may cold-start the Space
      signal: AbortSignal.timeout(20000),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data?.ok || !Array.isArray(data.embedding)) return null;
    return data.embedding;
  } catch (err) {
    console.error('face service embed error:', err.message);
    return null;
  }
}

/** Cosine similarity between two L2-normalised vectors (-1..1; higher = closer). */
export function cosineSim(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return -1;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // already normalised by the service
}

// Cosine-similarity match threshold + margin over the runner-up.
export const FACE_SIM_THRESHOLD = Number(process.env.FACE_THRESHOLD || 0.45);
export const FACE_SIM_MARGIN = Number(process.env.FACE_MARGIN || 0.04);
