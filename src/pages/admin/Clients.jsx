// My Clients — personal-training sessions + workout notes (spec 4.8).
// Trainers see their own clients; owner/manager see all PT sessions.
import { useEffect, useState } from 'react';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) : '—');

export default function Clients() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ membership_number: '', workout_notes: '', completed: true });
  const [msg, setMsg] = useState('');

  function load() {
    apiFetch('/admin/clients').then(setData).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function logSession() {
    setMsg('');
    if (!form.membership_number.trim()) {
      setMsg('Enter the member’s membership number.');
      return;
    }
    try {
      await apiFetch('/admin/training-session', { method: 'POST', body: form });
      setMsg('Session logged.');
      setForm({ membership_number: '', workout_notes: '', completed: true });
      load();
    } catch (e) {
      setMsg(e.message);
    }
  }

  return (
    <AdminShell>
      <h1 className="text-2xl font-bold uppercase text-body">My Clients</h1>
      {error && <p className="mt-4 text-error">{error}</p>}
      {data?.note && <p className="mt-2 rounded bg-elevated px-3 py-2 text-sm text-muted">{data.note}</p>}

      <div className="card mt-4 space-y-3">
        <h2 className="font-display uppercase text-body">Log a Training Session</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className="field" placeholder="Member number (GYM-2025-…)" value={form.membership_number} onChange={(e) => setForm({ ...form, membership_number: e.target.value })} />
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={form.completed} onChange={(e) => setForm({ ...form, completed: e.target.checked })} /> Completed
          </label>
        </div>
        <textarea className="field min-h-[70px]" placeholder="Workout notes…" value={form.workout_notes} onChange={(e) => setForm({ ...form, workout_notes: e.target.value })} />
        {msg && <p className="text-sm text-success">{msg}</p>}
        <button className="btn-primary px-4 py-2 text-sm" onClick={logSession}>Save session</button>
      </div>

      <h2 className="mt-8 font-display uppercase text-body">Recent Sessions</h2>
      <div className="mt-2 space-y-2">
        {data?.sessions?.length ? data.sessions.map((s) => (
          <div key={s.id} className="card">
            <div className="flex items-center justify-between">
              <span className="font-display text-body">{s.member} <span className="text-xs text-muted">({s.membership_number})</span></span>
              <span className="text-xs text-muted">{fmt(s.scheduled_at)} · {s.completed ? 'done' : 'planned'}{s.trainer ? ` · ${s.trainer}` : ''}</span>
            </div>
            {s.workout_notes && <p className="mt-1 text-sm text-muted">{s.workout_notes}</p>}
          </div>
        )) : <p className="text-muted">No sessions logged yet.</p>}
      </div>
    </AdminShell>
  );
}
