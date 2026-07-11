// "Upload from gallery" ID-photo picker. Opens the phone gallery / file
// browser, auto-crops the chosen picture to the corporate portrait standard
// (face-centred, eye-line aligned, 600×800) and hands the finished JPEG data
// URL to the parent via onPhoto(dataUrl, { faceDetected }).
import { useRef, useState } from 'react';
import { autoCropIdPhoto } from '../lib/idPhoto.js';

export default function IdPhotoUpload({
  onPhoto,
  label = '🖼️ Upload photo from gallery',
  className = 'btn-outline px-3 py-2 text-sm',
}) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const r = await autoCropIdPhoto(file);
      onPhoto(r.dataUrl, r);
    } catch (err) {
      setError(err.message || 'Could not process that image.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
      <button type="button" className={className} disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? 'Auto-cropping…' : label}
      </button>
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </div>
  );
}
