// Trainer management (spec 4.8): list, add, edit, remove trainers.
import { useEffect, useState } from 'react';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';
import PersonalQr from '../../components/PersonalQr.jsx';

const blank = { full_name: '', phone: '', email: '', specialization: '', certifications: '', bio: '', is_active: true };

export default function TrainerManagement() {
  const [trainers, setTrainers] = useState([]);
  const [form, setForm] = useState(null);
  const [qrFor, setQrFor] = useState(null);
  const [error, setError] = useState('');

  function load() {
    apiFetch('/admin/trainers').then((d) => setTrainers(d.trainers)).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function save() {
    setError('');
    try {
      if (form.id) await apiFetch(`/admin/trainers?id=${form.id}`, { method: 'PATCH', body: form });
      else await apiFetch('/admin/trainers', { method: 'POST', body: form });
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

      <div className="mt-4 space-y-2">
        {trainers.map((t) => (
          <div key={t.id} className="card flex items-center justify-between">
            <div>
              <div className="font-display uppercase text-body">{t.full_name}{!t.is_active && ' · inactive'}</div>
              <div className="text-xs text-muted">{[t.specialization, t.phone, t.email].filter(Boolean).join(' · ')}</div>
            </div>
            <div className="flex gap-2">
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
            <div className="flex gap-3">
              <button className="btn-primary flex-1" onClick={save}>Save</button>
              <button className="btn-outline" onClick={() => setForm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
