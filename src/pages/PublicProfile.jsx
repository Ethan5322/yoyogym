// QR Type B — public profile page. Anyone scanning a member's/trainer's QR
// lands here and sees ONLY name, photo, role, and a valid-member badge.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

export default function PublicProfile() {
  const { type, key } = useParams(); // type: 'm' | 't' | 's'
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const qs =
      type === 't'
        ? `type=trainer&id=${encodeURIComponent(key)}`
        : type === 's'
        ? `type=staff&id=${encodeURIComponent(key)}`
        : `type=member&key=${encodeURIComponent(key)}`;
    fetch(`/api/public-profile?${qs}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError('Could not load profile.'));
  }, [type, key]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-bg px-6 text-center">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-6 font-display text-2xl uppercase tracking-wider text-accent">Yoyo GYM</div>

        {error && <p className="text-error">{error}</p>}
        {!data && !error && <p className="text-muted">Loading…</p>}

        {data && !data.found && (
          <div className="card">
            <div className="text-5xl">❌</div>
            <p className="mt-3 text-body">No matching Yoyo GYM profile.</p>
          </div>
        )}

        {data && data.found && (
          <div className="card">
            {data.photo_url ? (
              <img src={data.photo_url} alt="" className="mx-auto h-32 w-32 rounded-full border-4 border-accent object-cover" />
            ) : (
              <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-full border-4 border-accent bg-elevated text-4xl text-accent">
                {data.name?.[0]}
              </div>
            )}
            <h1 className="mt-4 font-display text-3xl uppercase text-body">{data.name}</h1>
            <p className="mt-1 text-muted">
              {data.role}{data.subrole ? ` · ${data.subrole}` : ''}
            </p>
            <div
              className={`mt-5 inline-flex items-center gap-2 rounded-full px-4 py-2 font-display text-sm uppercase tracking-wider ${
                data.valid ? 'bg-success/20 text-success' : 'bg-error/20 text-error'
              }`}
            >
              {data.valid ? '✓' : '✕'} {data.status_label}
            </div>
          </div>
        )}

        <p className="mt-6 text-xs text-muted">Scan verified by Yoyo GYM</p>
      </div>
    </div>
  );
}
