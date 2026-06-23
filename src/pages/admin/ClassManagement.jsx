// Class management (spec 4.7): list, create, edit, delete classes.
import { useEffect, useState } from 'react';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIERS = ['basic', 'standard', 'premium', 'vip'];
const blank = {
  name: '', trainer_id: '', recurrence: 'recurring', day_of_week: 1, start_time: '18:00',
  duration_minutes: 60, max_capacity: 20, min_capacity: 0, require_booking: true, allowed_tiers: [], is_active: true,
};

export default function ClassManagement() {
  const [classes, setClasses] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');

  function load() {
    apiFetch('/admin/classes').then((d) => setClasses(d.classes)).catch((e) => setError(e.message));
    apiFetch('/admin/trainers').then((d) => setTrainers(d.trainers)).catch(() => {});
  }
  useEffect(load, []);

  async function save() {
    setError('');
    try {
      const body = { ...form, day_of_week: Number(form.day_of_week), duration_minutes: Number(form.duration_minutes), max_capacity: Number(form.max_capacity) };
      if (form.id) await apiFetch(`/admin/classes?id=${form.id}`, { method: 'PATCH', body });
      else await apiFetch('/admin/classes', { method: 'POST', body });
      setForm(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  }
  async function remove(id) {
    if (!confirm('Delete this class?')) return;
    await apiFetch(`/admin/classes?id=${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <AdminShell>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold uppercase text-body">Classes</h1>
        <button className="btn-primary px-4 py-2 text-sm" onClick={() => setForm({ ...blank })}>+ New Class</button>
      </div>
      {error && <p className="mt-4 text-error">{error}</p>}

      <div className="mt-4 space-y-2">
        {classes.map((c) => (
          <div key={c.id} className="card flex items-center justify-between">
            <div>
              <div className="font-display uppercase text-body">{c.name}</div>
              <div className="text-xs text-muted">
                {c.recurrence === 'recurring' ? DOW[c.day_of_week] : c.class_date} · {c.start_time?.slice(0, 5)} ·
                cap {c.max_capacity} {c.trainers?.full_name ? `· ${c.trainers.full_name}` : ''} {!c.is_active && '· inactive'}
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn-outline px-3 py-1 text-sm" onClick={() => setForm({ ...blank, ...c, trainer_id: c.trainer_id || '', allowed_tiers: c.allowed_tiers || [] })}>Edit</button>
              <button className="text-sm text-error" onClick={() => remove(c.id)}>Delete</button>
            </div>
          </div>
        ))}
        {!classes.length && <p className="text-muted">No classes yet.</p>}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setForm(null)}>
          <div className="card w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display uppercase text-body">{form.id ? 'Edit' : 'New'} Class</h2>
            <input className="field" placeholder="Class name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <select className="field" value={form.trainer_id} onChange={(e) => setForm({ ...form, trainer_id: e.target.value })}>
              <option value="">No trainer</option>
              {trainers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <select className="field" value={form.day_of_week} onChange={(e) => setForm({ ...form, day_of_week: e.target.value })}>
                {DOW.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
              <input className="field" type="time" value={form.start_time || ''} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              <input className="field" type="number" placeholder="Duration (min)" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} />
              <input className="field" type="number" placeholder="Max capacity" value={form.max_capacity} onChange={(e) => setForm({ ...form, max_capacity: e.target.value })} />
            </div>
            <div>
              <div className="mb-1 text-sm text-muted">Allowed tiers (none = all)</div>
              <div className="flex flex-wrap gap-2">
                {TIERS.map((t) => {
                  const on = form.allowed_tiers.includes(t);
                  return (
                    <button key={t} className={`rounded border px-3 py-1 text-sm uppercase ${on ? 'border-accent bg-accent text-black' : 'border-accent/50 text-accent'}`}
                      onClick={() => setForm({ ...form, allowed_tiers: on ? form.allowed_tiers.filter((x) => x !== t) : [...form.allowed_tiers, t] })}>
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
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
