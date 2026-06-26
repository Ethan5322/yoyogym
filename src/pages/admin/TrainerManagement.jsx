// Trainer management (spec 4.8): list, add, edit, remove trainers.
import { useEffect, useState } from 'react';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';
import PersonalQr from '../../components/PersonalQr.jsx';
import FaceCapture from '../../chatbot/components/FaceCapture.jsx';
import CredentialActions from '../../components/CredentialActions.jsx';

const blank = { full_name: '', phone: '', email: '', specialization: '', certifications: '', bio: '', is_active: true, photo_url: '', face_descriptor: null };

export default function TrainerManagement() {
  const [trainers, setTrainers] = useState([]);
  const [form, setForm] = useState(null);
  const [qrFor, setQrFor] = useState(null);
  const [faceOpen, setFaceOpen] = useState(false);
  const [created, setCreated] = useState(null);
  const [error, setError] = useState('');

  function load() {
    apiFetch('/admin/trainers').then((d) => setTrainers(d.trainers)).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function save() {
    setError(''); setCreated(null);
    try {
      if (form.id) {
        await apiFetch(`/admin/trainers?id=${form.id}`, { method: 'PATCH', body: form });
      } else {
        const r = await apiFetch('/admin/trainers', { method: 'POST', body: form });
        setCreated({
          kind: 'trainer',
          id: r.id,
          name: form.full_name,
          number: r.trainer_number,
          verification_code: r.verification_code,
          badge: form.specialization || 'TRAINER',
          photo_url: form.photo_url,
        });
      }
      setForm(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  }
  async function remove(id) {
    if (!confirm('Remove this trainer?')) return;
    await apiFetch(`/admin/trainers?id=${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <AdminShell>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold uppercase text-body">Trainers</h1>
        <button className="btn-primary px-4 py-2 text-sm" onClick={() => setForm({ ...blank })}>+ New Trainer</button>
      </div>
      {error && <p className="mt-4 text-error">{error}</p>}

      {created && (
        <div className="card mt-4 border border-accent/30">
          <h2 className="mb-1 font-display uppercase text-body">{created.name} — credential ready</h2>
          <p className="mb-2 text-xs text-muted">
            Trainer No: <span className="text-accent">{created.number || '—'}</span> · Verification: <span className="text-accent">{created.verification_code || '—'}</span>
          </p>
          <CredentialActions person={created} />
        </div>
      )}

      <div className="mt-4 space-y-2">
        {trainers.map((t) => (
          <div key={t.id} className="card flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {t.photo_url && <img src={t.photo_url} alt="" className="h-12 w-9 rounded object-cover gold-frame" />}
              <div>
                <div className="font-display uppercase text-body">{t.full_name}{!t.is_active && ' · inactive'}</div>
                <div className="text-xs text-muted">{[t.specialization, t.phone, t.email].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CredentialActions person={{ kind: 'trainer', id: t.id, name: t.full_name, number: t.trainer_number, verification_code: t.verification_code, badge: t.specialization || 'TRAINER', photo_url: t.photo_url }} />
              <button className="btn-outline px-3 py-1 text-sm" onClick={() => setQrFor(t)}>QR</button>
              <button className="btn-outline px-3 py-1 text-sm" onClick={() => setForm({ ...blank, ...t })}>Edit</button>
              <button className="text-sm text-error" onClick={() => remove(t.id)}>Remove</button>
            </div>
          </div>
        ))}
        {!trainers.length && <p className="text-muted">No trainers yet.</p>}
      </div>

      {qrFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setQrFor(null)}>
          <div className="card w-full max-w-xs" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 font-display uppercase text-body">{qrFor.full_name} — QR</h2>
            <PersonalQr url={`${window.location.origin}/p/t/${qrFor.id}`} name={qrFor.full_name} />
            <button className="btn-outline mt-3 w-full" onClick={() => setQrFor(null)}>Close</button>
          </div>
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setForm(null)}>
          <div className="card w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display uppercase text-body">{form.id ? 'Edit' : 'New'} Trainer</h2>
            <input className="field" placeholder="Full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            <input className="field" placeholder="Phone" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input className="field" placeholder="Email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className="field" placeholder="Specialization" value={form.specialization || ''} onChange={(e) => setForm({ ...form, specialization: e.target.value })} />
            <input className="field" placeholder="Certifications" value={form.certifications || ''} onChange={(e) => setForm({ ...form, certifications: e.target.value })} />
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active
            </label>

            <div className="flex items-center gap-3">
              {form.photo_url ? (
                <img src={form.photo_url} alt="" className="h-16 w-12 rounded object-cover gold-frame" />
              ) : (
                <div className="flex h-16 w-12 items-center justify-center rounded bg-elevated text-[10px] text-muted">No photo</div>
              )}
              <button className="btn-outline px-3 py-2 text-sm" onClick={() => setFaceOpen(true)}>
                {form.face_descriptor ? '✓ Retake face & photo' : '📷 Capture face & photo'}
              </button>
            </div>

            <div className="flex gap-3">
              <button className="btn-primary flex-1" onClick={save}>Save</button>
              <button className="btn-outline" onClick={() => setForm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {faceOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setFaceOpen(false)}>
          <div className="card w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 font-display uppercase text-body">Capture trainer face & photo</h2>
            <FaceCapture onSubmit={(res) => { if (res?.descriptor) setForm((f) => ({ ...f, face_descriptor: res.descriptor, photo_url: res.image })); setFaceOpen(false); }} />
          </div>
        </div>
      )}
    </AdminShell>
  );
}
