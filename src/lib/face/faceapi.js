// Lazy loader for @vladmandic/face-api with models served from a free CDN.
// Loaded only when a face step is reached, so the heavy TF.js bundle never
// affects the initial page load. No paid API — everything runs in the browser.
//
// SPEED RULES (the whole file exists to obey these):
//  1. Load only the nets a task actually needs, and load them in PARALLEL.
//     The four nets are ~13 MB together; the recognition net alone is 6.2 MB
//     and is useless for cropping a photo, while the SSD detector (5.4 MB) is
//     useless for drawing a positioning circle. Pulling all four for every task
//     was most of the wait people were feeling.
//  2. Detect with the TINY detector, not SSD MobileNet. Both feed the SAME
//     68-landmark alignment into the SAME recognition net, so the descriptors
//     they produce are interchangeable — measured on an enrolled member photo,
//     the two paths differ by 0.06, an order of magnitude below the 0.6 match
//     threshold. What they do NOT share is cost: on the same photo SSD took
//     3077 ms per pass against 492 ms for tiny at inputSize 416. Enrolment runs
//     ~16 of those passes, so SSD alone was ~49 s of the wait. SSD is kept as a
//     lazily-downloaded fallback for the frames tiny cannot find a face in.
//  3. Pin TF.js to the fastest backend the device will actually give us. Left
//     alone, TF.js can land on its pure-JS `cpu` backend, where a single
//     detection takes SECONDS. Note that tf.setBackend() reports failure by
//     RETURNING FALSE, not by throwing — so the result has to be checked.
//  4. Compile the shaders once, on a blank canvas, while the camera is still
//     warming up — otherwise the first real frame eats that cost in front of
//     the user.
let _faceapi = null;
const _nets = {}; // net name -> in-flight/settled load promise (memoised)
let _warm = null;

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model';

const NETS = {
  tiny: (f) => f.nets.tinyFaceDetector, // ~190 KB — live guidance, first-pass detection
  landmarks: (f) => f.nets.faceLandmark68Net, // ~350 KB — eye line, alignment
  ssd: (f) => f.nets.ssdMobilenetv1, // ~5.4 MB — high-accuracy detection
  recognition: (f) => f.nets.faceRecognitionNet, // ~6.2 MB — the 128-D descriptor
};

// Fastest first. `webgl` is what every healthy phone gives us. `wasm` is the
// safety net for devices where WebGL is missing or refuses to initialise (old
// Androids, hardened/privacy browsers, blocklisted GPU drivers) — it is roughly
// an order of magnitude quicker than the last-resort pure-JS `cpu` backend,
// where a single detection takes multiple seconds.
const BACKENDS = ['webgl', 'wasm', 'cpu'];

// face-api registers the WASM backend but ships no .wasm binaries, so the rung
// silently fails to initialise unless we point TF at them. They must match the
// bundled tfjs version exactly.
const TFJS_VERSION = '4.22.0';
const WASM_PATH = `https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@${TFJS_VERSION}/dist/`;

/** The backend we ended up on — surfaced so the UI can warn on the slow path. */
export let activeBackend = null;

/** Import the library and pin the fastest working backend (once). */
function lib() {
  if (!_faceapi) {
    _faceapi = import('@vladmandic/face-api').then(async (f) => {
      try {
        f.tf.setWasmPaths(WASM_PATH);
      } catch {
        /* older build without the hook — the wasm rung just won't take */
      }
      for (const b of BACKENDS) {
        try {
          // setBackend resolves FALSE when a backend can't initialise; it does
          // not throw. Silently ignoring that is what strands a device on `cpu`.
          if (await f.tf.setBackend(b)) break;
        } catch {
          /* try the next one down */
        }
      }
      await f.tf.ready();
      activeBackend = f.tf.getBackend();
      return f;
    });
  }
  return _faceapi;
}

/** Load the named nets in parallel; each net is fetched at most once. */
async function loadNets(...names) {
  const f = await lib();
  await Promise.all(
    names.map((n) => {
      if (!_nets[n]) {
        _nets[n] = NETS[n](f)
          .loadFromUri(MODEL_URL)
          .catch((e) => {
            delete _nets[n]; // a failed load must not be cached — allow a retry
            throw e;
          });
      }
      return _nets[n];
    })
  );
  return f;
}

/** Compile the WebGL shaders on a blank frame so the first real one is fast. */
async function warmUp(f) {
  if (_warm) return _warm;
  _warm = (async () => {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 160;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, 160, 160);
      await f.detectSingleFace(c, probeOptions(f)).withFaceLandmarks().withFaceDescriptor();
    } catch {
      /* warm-up is best-effort — never block the flow on it */
    }
  })();
  return _warm;
}

/** Nets for the live positioning guide only (box, no descriptor). ~190 KB. */
export function loadForGuide() {
  return loadNets('tiny');
}

/** Nets for cropping a still photo: detector + landmarks, no descriptor. ~540 KB. */
export function loadForCrop() {
  return loadNets('tiny', 'landmarks');
}

/** The accurate detector, loaded on demand when the tiny one finds nothing. */
export function loadAccurateDetector() {
  return loadNets('ssd', 'landmarks');
}

/** Everything needed to produce/compare 128-D descriptors (enrol, login, scan).
 *  SSD is deliberately NOT in this set: it is 5.4 MB of the 13 MB total and the
 *  descriptor path no longer routes through it (see SPEED RULE 2). It is still
 *  fetched lazily by `detectAccurate` for the frames tiny cannot resolve. */
export async function loadForRecognition() {
  const f = await loadNets('tiny', 'landmarks', 'recognition');
  await warmUp(f);
  return f;
}

// Detection settings for a descriptor-producing pass. 416 is the smallest tiny
// input that holds its recall on a face filling a third of the frame, and it
// measured no slower than 320 (492 ms vs 483 ms) — the cost at this size is the
// landmark + recognition passes, not the detector.
const PROBE_INPUT_SIZE = 416;
const PROBE_SCORE = 0.35;
const probeOptions = (f) =>
  new f.TinyFaceDetectorOptions({ inputSize: PROBE_INPUT_SIZE, scoreThreshold: PROBE_SCORE });

/** One landmark-aligned descriptor pass with the tiny detector. */
async function probe(f, el) {
  return f.detectSingleFace(el, probeOptions(f)).withFaceLandmarks().withFaceDescriptor();
}

/** Last-resort pass with SSD MobileNet, for the harsh-light / steep-angle frames
 *  the tiny detector misses. Downloads the 5.4 MB net the first time it is
 *  reached, which is why nothing on the happy path calls it. */
async function probeSsd(el) {
  const f = await loadNets('ssd', 'landmarks', 'recognition');
  return f.detectSingleFace(el, new f.SsdMobilenetv1Options({ minConfidence: 0.3 })).withFaceLandmarks().withFaceDescriptor();
}

const described = (det) => ({
  box: {
    x: det.detection.box.x,
    y: det.detection.box.y,
    width: det.detection.box.width,
    height: det.detection.box.height,
  },
  score: det.detection.score,
  descriptor: Array.from(det.descriptor),
});

/** Back-compat alias — callers that just want "the face engine, ready". */
export const getFaceApi = loadForRecognition;

/** Fast bounding-box-only detection for live positioning guidance.
 *  No landmarks, no descriptor — this runs every frame, so it stays cheap. */
export async function detectBox(el) {
  const faceapi = await loadForGuide();
  const det = await faceapi.detectSingleFace(
    el,
    new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 })
  );
  if (!det) return null;
  return { x: det.box.x, y: det.box.y, width: det.box.width, height: det.box.height, score: det.score };
}

/** Detect a single face and return BOTH its box and 128-d descriptor in one
 *  pass, using the fast tiny detector. */
export async function detectFull(el) {
  const faceapi = await loadForRecognition();
  const det = await probe(faceapi, el);
  return det ? described(det) : null;
}

/** A descriptor good enough to enrol or to match against, as fast as the device
 *  can produce one. The tiny detector handles the frame; SSD is only downloaded
 *  and run when tiny finds nothing, so a difficult angle degrades into a slower
 *  pass instead of a lost capture. Returns { box, score, descriptor } or null. */
export async function detectAccurate(el) {
  const faceapi = await loadForRecognition();
  const det = (await probe(faceapi, el)) || (await probeSsd(el));
  return det ? described(det) : null;
}

/** High-recall detection for ACCESS scanning.
 *
 *  Most frames of a scan contain no face at all (the person is still walking
 *  up), so a cheap box-only gate runs first and those frames cost ~100 ms
 *  instead of a full landmarks + descriptor pipeline. Only once a face is
 *  actually in frame do we pay for the descriptor.
 *  Returns { score, descriptor } or null. */
export async function detectMatch(el) {
  const faceapi = await loadForRecognition();
  const gate = await faceapi.detectSingleFace(
    el,
    new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 })
  );
  if (!gate) return null;

  const acc = await detectAccurate(el);
  return acc ? { score: acc.score, descriptor: acc.descriptor } : null;
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

/** Templates of a person: the `templates` gallery, or a single `descriptor`. */
function personTemplates(p) {
  if (Array.isArray(p.templates) && p.templates.length) {
    return p.templates.map((t) => (Array.isArray(t) ? t : t?.v)).filter(Array.isArray);
  }
  return Array.isArray(p.descriptor) ? [p.descriptor] : [];
}

/** Best match with a confidence margin: returns { person, distance, confident }.
 *  Each person is scored by their CLOSEST enrolled template — so a member only
 *  has to resemble one of their stored looks (e.g. clean-shaven OR bearded),
 *  not an average of them. `confident` requires the best person to be under
 *  threshold AND clearly closer than the runner-up person, which keeps
 *  look-alikes out even with the looser per-template matching. */
export function bestMatch(descriptor, people, threshold = MATCH_THRESHOLD, margin = 0.05) {
  let best = null;
  let bestDist = Infinity;
  let second = Infinity;
  for (const p of people) {
    let d = Infinity;
    for (const t of personTemplates(p)) {
      const dt = faceDistance(descriptor, t);
      if (dt < d) d = dt;
    }
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
