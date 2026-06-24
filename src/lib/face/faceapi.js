// Lazy loader for @vladmandic/face-api with models served from a free CDN.
// Loaded only when the face step is reached, so the heavy TF.js bundle never
// affects the initial page load. No paid API — everything runs in the browser.
let _faceapi = null;
let _modelsLoaded = false;

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model';

export async function getFaceApi() {
  if (!_faceapi) {
    _faceapi = await import('@vladmandic/face-api');
  }
  if (!_modelsLoaded) {
    await _faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await _faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    await _faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    _modelsLoaded = true;
  }
  return _faceapi;
}

/** Fast bounding-box-only detection for live positioning guidance. */
export async function detectBox(el) {
  const faceapi = await getFaceApi();
  const det = await faceapi.detectSingleFace(
    el,
    new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 })
  );
  if (!det) return null;
  return { x: det.box.x, y: det.box.y, width: det.box.width, height: det.box.height, score: det.score };
}

/** Detect a single face and return BOTH its box (for guidance) and 128-d
 *  descriptor (for the template) in one pass. */
export async function detectFull(el) {
  const faceapi = await getFaceApi();
  const det = await faceapi
    .detectSingleFace(el, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!det) return null;
  const b = det.detection.box;
  return {
    box: { x: b.x, y: b.y, width: b.width, height: b.height },
    score: det.detection.score,
    descriptor: Array.from(det.descriptor),
  };
}

/** Detect a single face in a video/image element and return its 128-d descriptor. */
export async function describeFace(el) {
  const full = await detectFull(el);
  return full ? full.descriptor : null;
}

/** Average several descriptors into one robust template. */
export function averageDescriptors(list) {
  if (!list || !list.length) return null;
  const n = list[0].length;
  const out = new Array(n).fill(0);
  for (const d of list) for (let i = 0; i < n; i++) out[i] += d[i];
  for (let i = 0; i < n; i++) out[i] /= list.length;
  return out;
}

/** Best match with a confidence margin: returns { person, distance, confident }.
 *  `confident` requires the best to be under threshold AND clearly better than
 *  the runner-up — this prevents look-alike mistakes. */
export function bestMatch(descriptor, people, threshold = MATCH_THRESHOLD, margin = 0.05) {
  let best = null;
  let bestDist = Infinity;
  let second = Infinity;
  for (const p of people) {
    const d = faceDistance(descriptor, p.descriptor);
    if (d < bestDist) {
      second = bestDist;
      bestDist = d;
      best = p;
    } else if (d < second) {
      second = d;
    }
  }
  const confident = !!best && bestDist < threshold && second - bestDist >= margin;
  return { person: best, distance: bestDist, confident };
}

/** Euclidean distance between two descriptors (lower = more similar). */
export function faceDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

// Match threshold: < 0.5 is a confident match (face-api convention is ~0.6).
export const MATCH_THRESHOLD = 0.5;
