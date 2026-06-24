// Phase 99 §A — Biometric face-scan access control (admin phone tool).
// Full-screen camera, animated scanning frame, live face detection, auto-capture,
// and CLIENT-SIDE matching against cached Supabase descriptors. No face image is
// ever sent to the server.
import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
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
    try {
      const { getFaceApi } = await import('../../lib/face/faceapi.js');
      const camP = navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 640, height: 640 } })
        .catch(() => navigator.mediaDevices.getUserMedia({ video: true }));
      await getFaceApi();
      const stream = await camP;
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      loopRef.current = true;
      runLoop();
    } catch {
      setError('Camera not available or permission denied.');
      setPhase('error');
    }
  }, []);

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
            setPhase('result');
          } catch (e) {
            setError(e.message);
            setPhase('error');
          }
        } else {
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
    setPhase('idle');
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-3 text-body">
        <span className="font-display text-lg uppercase tracking-wider text-accent">Yoyo GYM · Access</span>
        <Link to="/admin" className="text-sm text-muted hover:text-body">Exit</Link>
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
            <button className="btn-primary mt-8 px-10 py-4 text-xl" onClick={startScan}>Scan Member</button>
          </div>
        )}

        {(phase === 'scanning' || phase === 'detected' || phase === 'matching') && (
          <ScanFrame video={videoRef} detected={detected} matching={phase === 'matching'} />
        )}

        {phase === 'result' && card?.type === 'member' && (
          <MemberAccessCard data={card} onAction={memberAction} onClose={reset} busy={busy} actionMsg={actionMsg} />
        )}
        {phase === 'result' && card?.type === 'trainer' && <TrainerCard data={card} onClose={reset} />}
        {phase === 'nomatch' && <Unidentified onClose={reset} />}
      </div>
    </div>
  );
}

function ScanFrame({ video, detected, matching }) {
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
        {matching ? 'Matching…' : detected ? 'Face detected — hold still' : 'Scanning — position face in frame'}
      </p>
      <p className="mt-1 text-xs text-muted">Auto-captures when your face is clear and centered</p>
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
