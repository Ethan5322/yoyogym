// Section-2 identity step: biometric face scan (recommended) OR an ID photo
// uploaded from the gallery. Every membership card must carry a photo, so a
// member who declines the biometric still provides one — this step cannot be
// left photo-less. The biometric path also yields the ID photo (best frame of
// the enrolment sweep), so nobody is photographed twice.
import { useState } from 'react';
import FaceCapture from './FaceCapture.jsx';
import IdPhotoUpload from '../../components/IdPhotoUpload.jsx';

export default function IdPhotoStep({ onSubmit }) {
  const [mode, setMode] = useState('choice'); // choice | scan | upload
  const [photo, setPhoto] = useState(null);
  const [faceDetected, setFaceDetected] = useState(true);

  if (mode === 'scan') {
    // FaceCapture's skip returns null — go back to the choice instead of
    // submitting, so an ID photo is still provided one way or the other.
    return <FaceCapture onSubmit={(res) => (res?.descriptor ? onSubmit(res) : setMode('choice'))} />;
  }

  if (mode === 'upload') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          {photo ? (
            <img src={photo} alt="ID photo preview" className="h-32 w-24 rounded-lg border border-accent/40 object-cover" />
          ) : (
            <div className="flex h-32 w-24 items-center justify-center rounded-lg bg-elevated text-center text-[10px] uppercase text-muted">
              ID photo
            </div>
          )}
          <div className="flex-1 space-y-2">
            <IdPhotoUpload
              label={photo ? 'Choose a different photo' : '🖼️ Choose from gallery'}
              onPhoto={(url, r) => {
                setPhoto(url);
                setFaceDetected(r.faceDetected);
              }}
            />
            <p className="text-xs text-muted">
              {photo
                ? faceDetected
                  ? '✓ Auto-cropped to the corporate ID standard (face centred, passport framing).'
                  : 'No face detected — we centred the crop. A clear, front-facing photo works best.'
                : 'Pick a clear, front-facing photo. We auto-crop it to the official ID size.'}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button className="btn-primary flex-1" disabled={!photo} onClick={() => onSubmit({ photo })}>
            Use this photo
          </button>
          <button className="btn-outline" onClick={() => setMode('choice')}>
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <button className="btn-primary w-full" onClick={() => setMode('scan')}>
        🔒 Scan my face (recommended)
      </button>
      <p className="text-xs text-muted">
        One quick scan gives you hands-free gym access AND your ID card photo.
      </p>
      <button className="btn-outline w-full" onClick={() => setMode('upload')}>
        🖼️ No biometric — upload an ID photo
      </button>
      <p className="text-xs text-muted">
        Your membership card must carry a photo, so please choose one of the two. Stored privately (POPIA).
      </p>
    </div>
  );
}
