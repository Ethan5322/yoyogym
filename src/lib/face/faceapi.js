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

/** Detect a single face in a video/image element and return its 128-d descriptor. */
export async function describeFace(el) {
  const faceapi = await getFaceApi();
  const det = await faceapi
    .detectSingleFace(el, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  return det ? Array.from(det.descriptor) : null;
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
