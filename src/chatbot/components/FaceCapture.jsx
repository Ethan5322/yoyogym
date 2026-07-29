// Guided, corporate-grade face capture with two modes:
//
//   mode="enroll"  — walks the user through several poses and captures one
//                    template + one photo PER POSE, building a GALLERY. This is
//                    what makes recognition survive a new hairstyle, beard or
//                    makeup, and a member returning after a month away: the
//                    matcher scores against the closest of many stored looks.
//   mode="verify"  — a single quick capture for logging in / turnstile probes.
//
// A single stored template freezes one look and stops matching once the person
// changes — so enrolment deliberately captures breadth, and every captured
// image is embedded server-side into the accurate ArcFace gallery (not just one).
//
// onSubmit receives:
//   { descriptors: number[][], images: string[],   // the full gallery
//     descriptor: number[], image: string }         // pose 1, for single-probe
//                                                    // login and legacy callers
import { useEffect, useRef, useState } from 'react';
import { corporateFrame, renderIdPhoto } from '../../lib/idPhoto.js';

// Enrolment sweeps five poses and photographs each, so both engines get a
// multi-template gallery spanning angle and expression. Sample counts are the
// number of STEADY frames kept per pose — each one costs a full descriptor
// pass, so they are the main thing that decides how long enrolment feels.
// Averaging 2–3 steady frames is already enough for a stable template, and the
// BREADTH across poses is what actually makes recognition survive a haircut —
// so the budget goes into more poses, not more frames of the same pose.
const ENROLL_POSES = [
  { key: 'center', label: 'Look straight ahead', samples: 3 },
  { key: 'left', label: 'Turn your head slightly LEFT', samples: 2 },
  { key: 'right', label: 'Turn your head slightly RIGHT', samples: 2 },
  { key: 'up', label: 'Lift your chin up a little', samples: 2 },
  { key: 'down', label: 'Tuck your chin down a little', samples: 2 },
];
// Login just needs one solid probe.
const VERIFY_POSES = [{ key: 'center', label: 'Look at the camera', samples: 3 }];

const DWELL_MS = 600; // let the user settle into each new pose before sampling
const POSE_TIMEOUT_MS = 8000; // a difficult angle must not stall the whole sweep

export default function FaceCapture({ onSubmit, mode = 'enroll' }) {
  const isEnroll = mode !== 'verify';
  const poses = isEnroll ? ENROLL_POSES : VERIFY_POSES;

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const loopRef = useRef(false);
  const galleryRef = useRef({ descriptors: [], images: [] });
  // The 6.7 MB recognition set downloads in the background while the user is
  // already being guided into position; the loop awaits it only when it is
  // about to keep a frame.
  const recognitionRef = useRef(null);
  const recognitionReadyRef = useRef(false);

  const [phase, setPhase] = useState('loading'); // loading | scanning | capturing | error
  const [guide, setGuide] = useState('Starting camera…');
  const [good, setGood] = useState(false);
  const [progress, setProgress] = useState(0);
  const [poseIndex, setPoseIndex] = useState(0);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setPhase('loading');
    setError('');
    setProgress(0);
    setPoseIndex(0);
    galleryRef.current = { descriptors: [], images: [] };
    recognitionReadyRef.current = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('x'), { name: 'InsecureContext' });
        const { loadForGuide, loadForRecognition } = await import('../../lib/face/faceapi.js');
        const camP = navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 480, height: 480 } });
        // Start the heavy recognition download NOW but do not wait on it —
        // waiting for all 6.7 MB before the camera preview appeared was dead
        // time the user spent staring at "Starting camera…". The 190 KB guide
        // net is all the positioning circle needs.
        recognitionRef.current = loadForRecognition().then((f) => {
          recognitionReadyRef.current = true;
          return f;
        });
        recognitionRef.current.catch(() => {});
        await loadForGuide();
        const stream = await camP;
        if (!active) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setPhase('scanning');
        loopRef.current = true;
        // A model download that fails mid-sweep must surface as an error the
        // user can retry, not leave the sweep hanging on "scanning" forever.
        runPoseSequence().catch(() => {
          if (!active) return;
          loopRef.current = false;
          stop();
          setError('Could not load the face models. Check your connection and try again.');
          setPhase('error');
        });
      } catch (err) {
        const n = err?.name;
        setError(
          n === 'NotAllowedError'
            ? 'Camera blocked. Tap the 🔒 padlock in your browser bar → allow Camera, then Try again.'
            : n === 'NotFoundError'
            ? 'No camera found on this device.'
            : n === 'InsecureContext' || !window.isSecureContext
            ? 'Camera needs a secure (https) connection.'
            : 'Camera not available right now.'
        );
        setPhase('error');
      }
    })();
    return () => {
      active = false;
      loopRef.current = false;
      stop();
    };
    // eslint-disable-next-line
  }, [attempt, mode]);

  function stop() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  // Is the face acceptably framed right now? Returns whether the frame is good
  // enough to sample, plus a corrective hint. Tolerances are loose because the
  // turned/tilted poses move the face off-centre on purpose.
  function assess(det, fw, fh) {
    if (!det) return { ok: false, g: 'Position your face in the circle' };
    const { box } = det;
    const cx = fw - (box.x + box.width / 2); // mirrored preview
    const cy = box.y + box.height / 2;
    const dx = cx - fw / 2;
    const dy = cy - fh / 2;
    const size = box.width / fw;
    const tolX = fw * 0.2;
    const tolY = fh * 0.2;
    if (det.score < 0.55) return { ok: false, g: 'Hold steady — improve lighting' };
    if (size < 0.28) return { ok: false, g: 'Come a little closer' };
    if (size > 0.66) return { ok: false, g: 'Move back slightly' };
    if (Math.abs(dx) > tolX * 1.6 || Math.abs(dy) > tolY * 1.6) return { ok: false, g: 'Keep your face in the circle' };
    return { ok: true, g: '' };
  }

  async function runPoseSequence() {
    // Guidance uses the box-only detector; the expensive descriptor pass runs
    // ONLY on a frame we are actually going to keep. (Guiding with a full
    // detect+landmarks+descriptor pass and then re-detecting the same frame
    // accurately meant every kept frame ran the recognition net twice.)
    const { detectBox, detectAccurate, averageDescriptors } = await import('../../lib/face/faceapi.js');

    for (let pi = 0; pi < poses.length; pi++) {
      if (!loopRef.current) return;
      const pose = poses[pi];
      setPoseIndex(pi);
      setGuide(pose.label);
      setGood(false);
      setProgress(0);

      // Let the user move into the pose before we start counting samples.
      await sleep(DWELL_MS);

      const samples = [];
      let bestImage = null;
      let bestScore = -1;
      const started = Date.now();
      // Cap each pose so a difficult angle can't stall enrolment forever.
      while (loopRef.current && samples.length < pose.samples && Date.now() - started < POSE_TIMEOUT_MS) {
        const v = videoRef.current;
        let a = { ok: false, g: pose.label };
        let sampled = false;
        if (v && v.videoWidth) {
          let det = null;
          try {
            const b = await detectBox(v); // cheap: box only, no landmarks/descriptor
            if (b) det = { box: b, score: b.score };
          } catch {
            /* keep going */
          }
          a = assess(det, v.videoWidth, v.videoHeight);
          if (a.ok) {
            // The frame is worth keeping, so this is the moment to wait for the
            // recognition nets if they are still coming down the wire.
            if (!recognitionReadyRef.current) {
              setGuide('Hold still — preparing…');
              await recognitionRef.current;
              if (!loopRef.current) return;
            }
            const acc = await detectAccurate(v);
            sampled = true;
            if (acc?.descriptor) {
              samples.push(acc.descriptor);
              // Keep the sharpest frame of this pose as its photo.
              if ((acc.score || 0) > bestScore) {
                bestScore = acc.score || 0;
                bestImage = grabFrame(v, acc.box);
              }
            }
          }
        }
        setGood(a.ok);
        setGuide(a.ok ? `${pose.label} — hold still (${samples.length}/${pose.samples})` : a.g);
        setProgress(Math.round((samples.length / pose.samples) * 100));
        // Only idle between cheap box-only checks. A frame that just paid for a
        // full descriptor pass has already given the camera plenty of time.
        if (!sampled) await sleep(80);
      }
      if (!loopRef.current) return;

      if (samples.length) {
        // One robust template per pose (average of that pose's steady frames)…
        galleryRef.current.descriptors.push(averageDescriptors(samples));
        // …and a photo per pose, so the accurate ArcFace engine gets a full
        // gallery server-side rather than a single template.
        if (bestImage) galleryRef.current.images.push(bestImage);
      }
    }

    loopRef.current = false;
    await finalize();
  }

  // Corporate-standard 3:4 portrait (used for the ID card and ArcFace embed).
  // When the detector's face box is available the frame follows the ICAO
  // convention (head ~55% of frame, eye line in the upper half) instead of a
  // plain centre crop.
  function grabFrame(v, box) {
    if (!v || !v.videoWidth) return null;
    let frame = null;
    if (box?.width) frame = corporateFrame(v.videoWidth, v.videoHeight, box, null);
    if (!frame) {
      let sw = v.videoWidth;
      let sh = (sw * 4) / 3;
      if (sh > v.videoHeight) {
        sh = v.videoHeight;
        sw = (sh * 3) / 4;
      }
      frame = { x: (v.videoWidth - sw) / 2, y: (v.videoHeight - sh) / 2, w: sw, h: sh };
    }
    return renderIdPhoto(v, frame);
  }

  async function finalize() {
    setPhase('capturing');
    setGuide('Saving your face…');
    try {
      const { descriptors, images } = galleryRef.current;
      if (!descriptors.length) throw new Error('no-capture');
      stop();
      onSubmit({
        descriptors,
        images,
        descriptor: descriptors[0], // pose 1 — single-probe login + legacy callers
        image: images[0] || null,
      });
    } catch {
      setError('Could not capture. Please try again.');
      setPhase('error');
    }
  }

  function skip() {
    loopRef.current = false;
    stop();
    onSubmit(null);
  }

  // progress ring geometry
  const R = 130;
  const C = 2 * Math.PI * R;
  const overall = Math.round(((poseIndex + progress / 100) / poses.length) * 100);

  return (
    <div className="space-y-3 text-center">
      <div className="relative mx-auto h-64 w-64">
        <video
          ref={videoRef}
          className="h-full w-full rounded-full border border-white/10 object-cover"
          style={{ transform: 'scaleX(-1)' }}
          playsInline
          muted
        />
        {/* progress ring — overall across all poses */}
        <svg className="pointer-events-none absolute inset-0 -rotate-90" viewBox="0 0 288 288">
          <circle cx="144" cy="144" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="6" />
          <circle
            cx="144"
            cy="144"
            r={R}
            fill="none"
            stroke={good ? '#2ECC71' : 'var(--accent)'}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C - (C * overall) / 100}
            style={{ transition: 'stroke-dashoffset 180ms linear' }}
          />
        </svg>
        {phase === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">Starting camera…</div>
        )}
        {(phase === 'scanning' || phase === 'capturing') && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 font-display text-sm text-accent">
            {isEnroll ? `Step ${Math.min(poseIndex + 1, poses.length)}/${poses.length} · ` : ''}
            {overall}%
          </div>
        )}
      </div>

      {phase !== 'error' && (
        <p className={`font-display text-lg uppercase tracking-wide ${good ? 'text-success' : 'text-body'}`}>{guide}</p>
      )}
      {error && <p className="rounded-lg bg-error/10 px-3 py-2 text-sm text-error">{error}</p>}

      {phase === 'error' ? (
        <div className="flex gap-3">
          <button className="btn-primary flex-1" onClick={() => setAttempt((a) => a + 1)}>Try again</button>
          <button className="btn-outline" onClick={skip}>Skip</button>
        </div>
      ) : (
        <button className="btn-outline w-full" onClick={skip}>
          {isEnroll ? 'Skip — enrol later' : 'Cancel'}
        </button>
      )}
      {isEnroll && (
        <p className="text-xs text-muted">
          We capture several angles so your face still unlocks after a haircut, beard or makeup change. Stored privately (POPIA).
        </p>
      )}
    </div>
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
