// Phase 99 §A — Biometric face-scan access control (admin phone tool).
// Full-screen camera, animated scanning frame, live face detection, auto-capture,
// and CLIENT-SIDE matching against cached Supabase descriptors. No face image is
// ever sent to the server.
import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { beep, soundEnabled, setSoundEnabled } from '../../lib/sound.js';
import { MemberAccessCard, TrainerCard, Unidentified } from './scan/AccessCards.jsx';

export default function FaceScan() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const loopRef = useRef(false);
  const peopleRef = useRef([]);

  const [phase, setPhase] = useState('init'); // init | idle | scanning | detected | matching | result | nomatch | error
  const [detected, setDetected] = useState(false);
  const [card, setCard] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [flagged, setFlagged] = useState(null);
  const [flash, setFlash] = useState(null); // 'success' | 'fail'
  const [sound, setSound] = useState(soundEnabled());
  const [mode, setMode] = useState('face'); // 'face' | 'qr'

  function flashFx(kind) {
    setFlash(kind);
    beep(kind);
    setTimeout(() => setFlash(null), 800);
  }

  // load cached descriptors once
  useEffect(() => {
    apiFetch('/admin/face-descriptors')
      .then((d) => {
        peopleRef.current = (d.people || []).filter((p) => Array.isArray(p.descriptor));
        setPhase('idle');
      })
      .catch((e) => {
        setError(e.message);
        setPhase('error');
      });
    return () => stopCamera();
    // eslint-disable-next-line
  }, []);

  function stopCamera() {
    loopRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  const startScan = useCallback(async () => {
    setError('');
    setCard(null);
    setActionMsg('');
    setDetected(false);
    setPhase('scanning');

    // 1) Camera first — its own error handling (separate from face models).
    let stream;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('insecure');
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 640, height: 640 } });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true }); // fallback (e.g. laptop front cam)
      }
    } catch (err) {
      setError(
        err?.name === 'NotAllowedError'
          ? 'Camera blocked. Tap the 🔒 padlock in the address bar → allow Camera, then Try again.'
          : !window.isSecureContext
          ? 'Camera needs a secure (https) connection — open the site via its https address.'
          : 'No camera available on this device.'
      );
      setPhase('error');
      return;
    }

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {});
    }

    // 2) Run the right loop. QR mode does NOT need the face models.
    loopRef.current = true;
    if (mode === 'qr') {
      runQrLoop();
      return;
    }
    try {
      const { getFaceApi } = await import('../../lib/face/faceapi.js');
      await getFaceApi(); // load models (CDN) — only for face mode
      runLoop();
    } catch {
      stopCamera();
      setError('Could not load the face-recognition models (check your connection). QR mode still works.');
      setPhase('error');
    }
  }, [mode]);

  async function runQrLoop() {
    const jsQR = (await import('jsqr')).default;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    while (loopRef.current) {
      const v = videoRef.current;
      if (v && v.videoWidth) {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height);
        if (code && code.data) {
          loopRef.current = false;
          stopCamera();
          await handleQr(code.data);
          return;
        }
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  async function handleQr(text) {
    setPhase('matching');
    setDetected(true);
    try {
      let type, id;
      if (text.includes('/p/t/')) {
        type = 'trainer';
        id = text.split('/p/t/')[1].split(/[?#/]/)[0];
      } else if (text.includes('/p/m/')) {
        const num = text.split('/p/m/')[1].split(/[?#/]/)[0];
        const r = await apiFetch(`/admin/resolve-member?membership_number=${encodeURIComponent(num)}`);
        if (!r.found) throw new Error('not found');
        type = 'member';
        id = r.id;
      } else {
        const r = await apiFetch(`/admin/resolve-member?membership_number=${encodeURIComponent(text.trim())}`);
        if (!r.found) throw new Error('not found');
        type = 'member';
        id = r.id;
      }
      const data = await apiFetch(`/admin/access-card?type=${type}&id=${id}`);
      setCard(data);
      flashFx('success');
      setPhase('result');
    } catch {
      flashFx('fail');
      setPhase('nomatch');
    }
  }

  async function runLoop() {
    const { describeFace, faceDistance, MATCH_THRESHOLD } = await import('../../lib/face/faceapi.js');
    while (loopRef.current) {
      let descriptor = null;
      try {
        descriptor = await describeFace(videoRef.current);
      } catch {
        /* keep scanning */
      }
      if (!loopRef.current) return;

      if (descriptor) {
        setDetected(true);
        // find best match
        let best = null;
        let bestDist = Infinity;
        for (const p of peopleRef.current) {
          const dist = faceDistance(descriptor, p.descriptor);
          if (dist < bestDist) {
            bestDist = dist;
            best = p;
          }
        }
        loopRef.current = false;
        stopCamera();
        if (best && bestDist < MATCH_THRESHOLD) {
          setPhase('matching');
          try {
            const data = await apiFetch(`/admin/access-card?type=${best.type}&id=${best.id}`);
            setCard(data);
            flashFx('success');
            setPhase('result');
          } catch (e) {
            setError(e.message);
            setPhase('error');
          }
        } else {
          flashFx('fail');
          setPhase('nomatch');
        }
        return;
      }
      setDetected(false);
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  async function memberAction(action) {
    if (!card?.member) return;
    setBusy(true);
    setActionMsg('');
    try {
      const r = await apiFetch('/admin/access-action', { method: 'POST', body: { type: 'member', id: card.member.id, action } });
      setActionMsg(r.message);
      if (action === 'checkin') setFlagged(r.compliance && r.compliance !== 'ok' ? r.compliance : null);
      if (action === 'approve_visit' || action === 'deny_visit') setFlagged(null);
      // refresh card to update timer / inside state
      const data = await apiFetch(`/admin/access-card?type=member&id=${card.member.id}`);
      setCard(data);
    } catch (e) {
      setActionMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    stopCamera();
    setCard(null);
    setActionMsg('');
    setFlagged(null);
    setPhase('idle');
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black">
      {/* success / fail flash */}
      {flash && (
        <div className={`pointer-events-none fixed inset-0 z-50 flex items-center justify-center ${flash === 'success' ? 'bg-success/20' : 'bg-error/20'}`}>
          <div className={`animate-flash text-[9rem] ${flash === 'success' ? 'text-success' : 'text-error'}`}>
            {flash === 'success' ? '✓' : '✕'}
          </div>
        </div>
      )}

      {/* header */}
      <div className="flex items-center justify-between px-4 py-3 text-body">
        <span className="font-display text-lg uppercase tracking-wider text-accent">Yoyo GYM · Access</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { const n = !sound; setSound(n); setSoundEnabled(n); }}
            className="text-sm text-muted hover:text-body"
            title="Toggle sound"
          >
            {sound ? '🔊' : '🔇'}
          </button>
          <Link to="/admin" className="text-sm text-muted hover:text-body">Exit</Link>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-8">
        {phase === 'init' && <Skeleton text="Loading biometric data…" />}
        {phase === 'error' && (
          <div className="text-center">
            <p className="rounded-lg bg-error/10 px-4 py-3 text-error">{error}</p>
            <button className="btn-outline mt-4" onClick={reset}>Try again</button>
          </div>
        )}

        {phase === 'idle' && (
          <div className="text-center">
            <div className="mb-6 text-6xl">🛡️</div>
            <h1 className="font-display text-3xl uppercase text-body">Biometric Access</h1>
            <p className="mt-2 text-muted">{peopleRef.current.length} enrolled profiles loaded</p>
            <div className="mt-6 inline-flex rounded-lg bg-elevated p-1">
              {['face', 'qr'].map((mo) => (
                <button
                  key={mo}
                  onClick={() => setMode(mo)}
                  className={`rounded-md px-5 py-2 font-display uppercase ${mode === mo ? 'bg-accent text-black' : 'text-muted'}`}
                >
                  {mo === 'face' ? 'Face' : 'QR'}
                </button>
              ))}
            </div>
            <button className="btn-primary mt-6 block w-full px-10 py-4 text-xl" onClick={startScan}>
              {mode === 'qr' ? 'Scan QR Code' : 'Scan Face'}
            </button>
          </div>
        )}

        {(phase === 'scanning' || phase === 'detected' || phase === 'matching') && (
          <ScanFrame video={videoRef} detected={detected} matching={phase === 'matching'} mode={mode} />
        )}

        {phase === 'result' && card?.type === 'member' && (
          <MemberAccessCard data={card} onAction={memberAction} onClose={reset} busy={busy} actionMsg={actionMsg} flagged={flagged} />
        )}
        {phase === 'result' && card?.type === 'trainer' && <TrainerCard data={card} onClose={reset} />}
        {phase === 'nomatch' && <Unidentified onClose={reset} />}
      </div>
    </div>
  );
}

function ScanFrame({ video, detected, matching, mode = 'face' }) {
  const qr = mode === 'qr';
  return (
    <div className="w-full max-w-sm text-center">
      <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-3xl bg-elevated">
        <video ref={video} className="h-full w-full object-cover" playsInline muted />
        {/* corner frame */}
        {['left-3 top-3 border-l-4 border-t-4', 'right-3 top-3 border-r-4 border-t-4', 'left-3 bottom-3 border-l-4 border-b-4', 'right-3 bottom-3 border-r-4 border-b-4'].map((c, i) => (
          <span key={i} className={`absolute h-10 w-10 rounded-sm border-accent animate-corner-pulse ${c}`} />
        ))}
        {/* sweep line */}
        {!matching && <span className="absolute left-6 right-6 h-0.5 bg-accent/80 animate-scan-sweep shadow-[0_0_12px_2px] shadow-accent" />}
        {/* detection ring */}
        {detected && !matching && (
          <span className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-success animate-ping-soft" />
        )}
        {matching && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-accent border-t-transparent" />
          </div>
        )}
      </div>
      <p className={`mt-5 font-display text-lg uppercase tracking-wider ${detected ? 'text-success' : 'text-body'}`}>
        {matching ? 'Matching…' : qr ? 'Scanning — position QR code in frame' : detected ? 'Face detected — hold still' : 'Scanning — position face in frame'}
      </p>
      <p className="mt-1 text-xs text-muted">{qr ? 'Auto-reads the member’s QR code' : 'Auto-captures when your face is clear and centered'}</p>
    </div>
  );
}

function Skeleton({ text }) {
  return (
    <div className="w-full max-w-sm space-y-3 text-center">
      <div className="mx-auto h-56 w-56 animate-skeleton rounded-3xl bg-elevated" />
      <div className="mx-auto h-4 w-40 animate-skeleton rounded bg-elevated" />
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}
