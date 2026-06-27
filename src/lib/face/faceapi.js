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
    // Tiny detector = fast live positioning guidance.
    // SSD MobileNet v1 = higher-accuracy detection used for the actual
    //   enrolment template + match probes (better face alignment -> a more
    //   discriminating 128-D descriptor across eyes/nose/jaw/face shape).
    // 68-pt landmarks align the face before the recognition net runs.
    await _faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await _faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
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
 *  descriptor (for the template) in one pass. Tuned for the live enrolment
 *  guide loop (responsive). */
export async function detectFull(el) {
  const faceapi = await getFaceApi();
  const det = await faceapi
    .detectSingleFace(el, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 }))
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

/** High-ACCURACY detection (SSD MobileNet v1) used for enrolment templates and
 *  match probes — better alignment than the tiny detector means a descriptor
 *  that captures the full facial arrangement more reliably across lighting,
 *  angle and a few days' change. Returns { box, score, descriptor } or null. */
export async function detectAccurate(el) {
  const faceapi = await getFaceApi();
  const det = await faceapi
    .detectSingleFace(el, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!det) return null;
  const b = det.detection.box;
  return { box: { x: b.x, y: b.y, width: b.width, height: b.height }, score: det.detection.score, descriptor: Array.from(det.descriptor) };
}

/** High-recall detection for ACCESS scanning. Uses the accurate SSD detector
 *  for a discriminating descriptor. Returns { score, descriptor } or null. */
export async function detectMatch(el) {
  const acc = await detectAccurate(el);
  if (acc) return { score: acc.score, descriptor: acc.descriptor };
  // Fallback to the tiny detector in poor conditions so we still get a probe.
  const faceapi = await getFaceApi();
  const det = await faceapi
    .detectSingleFace(el, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.3 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!det) return null;
  return { score: det.detection.score, descriptor: Array.from(det.descriptor) };
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

// Match threshold (Euclidean distance on the 128-D descriptor). The face-api
// convention is ~0.6 for a confident same-person match; 0.6 tolerates lighting
// and a few days' change while still separating different people.
export const MATCH_THRESHOLD = 0.6;
