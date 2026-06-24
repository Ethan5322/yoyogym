// Guided, corporate-grade face capture. Live positioning feedback
// (move left/right/up/down, come closer, hold still) + a capture progress %
// that fills while the face is held steady, then auto-captures the descriptor.
// Used in registration, admin face enrolment, and admin face login.
import { useEffect, useRef, useState } from 'react';

const STEP = 25; // progress added per good frame (~4 frames ≈ 1s to 100%)

export default function FaceCapture({ onSubmit }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const loopRef = useRef(false);
  const progressRef = useRef(0);

  const [phase, setPhase] = useState('loading'); // loading | scanning | capturing | error
  const [guide, setGuide] = useState('Starting camera…');
  const [good, setGood] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setPhase('loading');
    setError('');
    setProgress(0);
    progressRef.current = 0;
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
        runGuideLoop();
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

  async function runGuideLoop() {
    const { detectBox } = await import('../../lib/face/faceapi.js');
    while (loopRef.current) {
      const v = videoRef.current;
      let g = 'Position your face in the circle';
      let ok = false;
      if (v && v.videoWidth) {
        const fw = v.videoWidth;
        const fh = v.videoHeight;
        let box = null;
        try {
          box = await detectBox(v);
        } catch {
          /* keep going */
        }
        if (box) {
          const cx = fw - (box.x + box.width / 2); // mirrored preview
          const cy = box.y + box.height / 2;
          const dx = cx - fw / 2;
          const dy = cy - fh / 2;
          const size = box.width / fw;
          const tolX = fw * 0.15;
          const tolY = fh * 0.15;
          if (size < 0.3) g = 'Come a little closer';
          else if (size > 0.62) g = 'Move back slightly';
          else if (dx < -tolX) g = 'Move right →';
          else if (dx > tolX) g = '← Move left';
          else if (dy < -tolY) g = 'Move down a little';
          else if (dy > tolY) g = 'Lift up a little';
          else {
            ok = true;
            g = 'Perfect — hold still';
          }
        }
      }
      setGuide(g);
      setGood(ok);

      if (ok) {
        progressRef.current = Math.min(100, progressRef.current + STEP);
      } else {
        progressRef.current = 0;
      }
      setProgress(progressRef.current);

      if (progressRef.current >= 100) {
        loopRef.current = false;
        await capture();
        return;
      }
      await new Promise((r) => setTimeout(r, 220));
    }
  }

  async function capture() {
    setPhase('capturing');
    setGuide('Capturing…');
    try {
      const { describeFace } = await import('../../lib/face/faceapi.js');
      const v = videoRef.current;
      const descriptor = await describeFace(v);
      if (!descriptor) {
        // lost the face at the last moment — resume guiding
        progressRef.current = 0;
        setProgress(0);
        setPhase('scanning');
        loopRef.current = true;
        runGuideLoop();
        return;
      }
      const canvas = document.createElement('canvas');
      const size = 320;
      canvas.width = size;
      canvas.height = size;
      const s = Math.min(v.videoWidth, v.videoHeight);
      canvas.getContext('2d').drawImage(v, (v.videoWidth - s) / 2, (v.videoHeight - s) / 2, s, s, 0, 0, size, size);
      const image = canvas.toDataURL('image/jpeg', 0.8);
      stop();
      onSubmit({ descriptor, image });
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
        {/* progress ring */}
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
            strokeDashoffset={C - (C * progress) / 100}
            style={{ transition: 'stroke-dashoffset 180ms linear' }}
          />
        </svg>
        {phase === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">Starting camera…</div>
        )}
        {(phase === 'scanning' || phase === 'capturing') && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 font-display text-sm text-accent">
            {progress}%
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
      <p className="text-xs text-muted">Your face is used only for secure gym access. Stored privately (POPIA).</p>
    </div>
  );
}
