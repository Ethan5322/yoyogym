// Face enrollment during registration (Phase 88). Opens the device camera,
// captures one frame, computes a 128-point face descriptor in-browser, and
// returns { descriptor, image } to be stored permanently in Supabase.
// Gracefully skippable (camera may be unavailable / permission denied).
import { useEffect, useRef, useState } from 'react';

export default function FaceCapture({ onSubmit }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [phase, setPhase] = useState('loading'); // loading | ready | capturing | error
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // warm up models (lazy import) in parallel with camera
        const { getFaceApi } = await import('../../lib/face/faceapi.js');
        const camP = navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 480, height: 480 } });
        await getFaceApi();
        const stream = await camP;
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setPhase('ready');
      } catch (err) {
        setError(err?.name === 'NotAllowedError' ? 'Camera permission denied.' : 'Camera not available.');
        setPhase('error');
      }
    })();
    return () => {
      active = false;
      stop();
    };
    // eslint-disable-next-line
  }, []);

  function stop() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  async function capture() {
    setPhase('capturing');
    setError('');
    try {
      const { describeFace } = await import('../../lib/face/faceapi.js');
      const video = videoRef.current;
      const descriptor = await describeFace(video);
      if (!descriptor) {
        setError('No face detected — look straight at the camera in good light, then try again.');
        setPhase('ready');
        return;
      }
      // snapshot (downscaled jpeg) for the member photo
      const canvas = document.createElement('canvas');
      const size = 320;
      canvas.width = size;
      canvas.height = size;
      const s = Math.min(video.videoWidth, video.videoHeight);
      canvas
        .getContext('2d')
        .drawImage(video, (video.videoWidth - s) / 2, (video.videoHeight - s) / 2, s, s, 0, 0, size, size);
      const image = canvas.toDataURL('image/jpeg', 0.8);
      stop();
      onSubmit({ descriptor, image });
    } catch {
      setError('Could not capture. Please try again or skip.');
      setPhase('ready');
    }
  }

  function skip() {
    stop();
    onSubmit(null);
  }

  return (
    <div className="space-y-3 text-center">
      <div className="relative mx-auto h-56 w-56 overflow-hidden rounded-2xl border border-accent/40 bg-elevated">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
        {phase === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">Starting camera…</div>
        )}
        <div className="pointer-events-none absolute inset-6 rounded-full border-2 border-accent/50" />
      </div>

      {error && <p className="rounded-lg bg-error/10 px-3 py-2 text-sm text-error">{error}</p>}

      {phase === 'error' ? (
        <button className="btn-outline w-full" onClick={skip}>Skip — I’ll enrol at reception</button>
      ) : (
        <div className="flex gap-3">
          <button className="btn-primary flex-1" disabled={phase !== 'ready'} onClick={capture}>
            {phase === 'capturing' ? 'Capturing…' : 'Capture Face'}
          </button>
          <button className="btn-outline" onClick={skip}>Skip</button>
        </div>
      )}
      <p className="text-xs text-muted">Your face is used only for secure gym access. Stored privately (POPIA).</p>
    </div>
  );
}
