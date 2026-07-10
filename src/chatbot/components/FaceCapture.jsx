// Guided, corporate-grade MULTI-POSE face capture.
//
// A single face template freezes one look. When the person later changes their
// hairstyle, grows or shaves a beard, or wears makeup, that frozen template
// stops matching. So enrolment walks the user through a short series of poses
// (look straight, turn slightly left, slightly right, tilt up) and captures one
// template + one frame per pose. The result is a GALLERY the matcher scores by
// its closest entry — the person only has to resemble one stored look.
//
// onSubmit receives:
//   { descriptors: number[][], images: string[],   // the full gallery
//     descriptor: number[], image: string }         // pose 1, for single-probe
//                                                    // login and legacy callers
import { useEffect, useRef, useState } from 'react';

// Each pose: an instruction, and how many steady frames to average for it.
const POSES = [
  { key: 'center', label: 'Look straight ahead', capture: true, samples: 4 },
  { key: 'left', label: 'Turn your head slightly LEFT', capture: false, samples: 3 },
  { key: 'right', label: 'Turn your head slightly RIGHT', capture: false, samples: 3 },
  { key: 'up', label: 'Lift your chin up a little', capture: false, samples: 3 },
];
const DWELL_MS = 900; // give the user a moment to move into each new pose

export default function FaceCapture({ onSubmit }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const loopRef = useRef(false);
  const galleryRef = useRef({ descriptors: [], images: [] });

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
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('x'), { name: 'InsecureContext' });
        const { getFaceApi } = await import('../../lib/face/faceapi.js');
        const camP = navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 480, height: 480 } });
        await getFaceApi();
        const stream = await camP;
        if (!active) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setPhase('scanning');
        loopRef.current = true;
        runPoseSequence();
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
  }, [attempt]);

  function stop() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  // Is the face acceptably framed right now? Returns whether the frame is good
  // enough to sample, plus a corrective hint. Tolerances are looser than a
  // single-pose capture because the turned/tilted poses move the face off-centre
  // on purpose.
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
    const { detectFull, detectAccurate, averageDescriptors } = await import('../../lib/face/faceapi.js');

    for (let pi = 0; pi < POSES.length; pi++) {
      if (!loopRef.current) return;
      const pose = POSES[pi];
      setPoseIndex(pi);
      setGuide(pose.label);
      setGood(false);
      setProgress(0);

      // Let the user move into the pose before we start counting samples.
      await sleep(DWELL_MS);

      const samples = [];
      let lastImage = null;
      while (loopRef.current && samples.length < pose.samples) {
        const v = videoRef.current;
        let a = { ok: false, g: pose.label };
        if (v && v.videoWidth) {
          let det = null;
          try {
            det = await detectFull(v);
          } catch {
            /* keep going */
          }
          a = assess(det, v.videoWidth, v.videoHeight);
          if (a.ok) {
            const acc = await detectAccurate(v);
            if (acc?.descriptor) {
              samples.push(acc.descriptor);
              if (pose.capture) lastImage = grabFrame(v);
            }
          }
        }
        setGood(a.ok);
        setGuide(a.ok ? `${pose.label} — hold still (${samples.length}/${pose.samples})` : a.g);
        setProgress(Math.round((samples.length / pose.samples) * 100));
        await sleep(160);
      }
      if (!loopRef.current) return;

      if (samples.length) {
        // One robust template per pose (average of that pose's steady frames).
        galleryRef.current.descriptors.push(averageDescriptors(samples));
        // Capture a clean passport frame at the straight-ahead pose.
        if (pose.capture) galleryRef.current.images.push(lastImage || grabFrame(videoRef.current));
      }
    }

    loopRef.current = false;
    await finalize();
  }

  // Clear passport-style 3:4 portrait (used for the ID card and ArcFace embed).
  function grabFrame(v) {
    if (!v || !v.videoWidth) return null;
    const ow = 600;
    const oh = 800;
    const canvas = document.createElement('canvas');
    canvas.width = ow;
    canvas.height = oh;
    let sw = v.videoWidth;
    let sh = (sw * 4) / 3;
    if (sh > v.videoHeight) {
      sh = v.videoHeight;
      sw = (sh * 3) / 4;
    }
    const sx = (v.videoWidth - sw) / 2;
    const sy = (v.videoHeight - sh) / 2;
    canvas.getContext('2d').drawImage(v, sx, sy, sw, sh, 0, 0, ow, oh);
    return canvas.toDataURL('image/jpeg', 0.9);
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
  const overall = Math.round(((poseIndex + progress / 100) / POSES.length) * 100);

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
            Step {Math.min(poseIndex + 1, POSES.length)}/{POSES.length} · {overall}%
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
        <button className="btn-outline w-full" onClick={skip}>Skip — enrol later</button>
      )}
      <p className="text-xs text-muted">
        We capture a few angles so your face still unlocks after a haircut, beard or makeup change. Stored privately (POPIA).
      </p>
    </div>
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
