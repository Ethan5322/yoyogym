// Class management (spec 4.7): list, create, edit, delete classes, view
// bookings, cancel an occurrence and notify, message booked members.
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
  const [bookingsFor, setBookingsFor] = useState(null);
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
              <button className="btn-outline px-3 py-1 text-sm" onClick={() => setBookingsFor(c)}>Bookings</button>
              <button className="btn-outline px-3 py-1 text-sm" onClick={() => setForm({ ...blank, ...c, trainer_id: c.trainer_id || '', allowed_tiers: c.allowed_tiers || [] })}>Edit</button>
              <button className="text-sm text-error" onClick={() => remove(c.id)}>Delete</button>
            </div>
          </div>
        ))}
        {!classes.length && <p className="text-muted">No classes yet.</p>}
      </div>

      {bookingsFor && <BookingsModal klass={bookingsFor} onClose={() => setBookingsFor(null)} />}

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

function BookingsModal({ klass, onClose }) {
  const [bookings, setBookings] = useState(null);
  const [msg, setMsg] = useState('');
  const [notice, setNotice] = useState('');

  function load() {
    apiFetch(`/admin/class-bookings?class_id=${klass.id}`)
      .then((d) => setBookings(d.bookings))
      .catch((e) => setMsg(e.message));
  }
  useEffect(load, [klass.id]);

  // group by date
  const byDate = {};
  (bookings || []).forEach((b) => {
    (byDate[b.session_date] ||= []).push(b);
  });

  async function cancelDate(date) {
    if (!confirm(`Cancel ${klass.name} on ${date} and email booked members?`)) return;
    try {
      const r = await apiFetch('/admin/class-bookings', { method: 'POST', body: { class_id: klass.id, session_date: date, op: 'cancel' } });
      setMsg(`Cancelled ${r.cancelled} booking(s), emailed ${r.emailed}.`);
      load();
    } catch (e) {
      setMsg(e.message);
    }
  }
  async function notifyDate(date) {
    if (!notice.trim()) {
      setMsg('Type a message first.');
      return;
    }
    try {
      const r = await apiFetch('/admin/class-bookings', { method: 'POST', body: { class_id: klass.id, session_date: date, op: 'notify', message: notice } });
      setMsg(`Emailed ${r.emailed} member(s).`);
      setNotice('');
    } catch (e) {
      setMsg(e.message);
    }
  }
  async function act(body, label) {
    try {
      await apiFetch('/admin/class-bookings', { method: 'POST', body });
      setMsg(label);
      load();
    } catch (e) {
      setMsg(e.message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display uppercase text-body">{klass.name} — Bookings</h2>
          <button className="text-sm text-muted" onClick={onClose}>Close</button>
        </div>
        {msg && <p className="rounded bg-elevated px-3 py-2 text-sm text-body">{msg}</p>}
        {!bookings && <p className="text-muted">Loading…</p>}
        {bookings && !bookings.length && <p className="text-muted">No upcoming bookings.</p>}

        <div className="max-h-[40vh] space-y-3 overflow-y-auto">
          {Object.entries(byDate).map(([date, list]) => (
            <div key={date} className="rounded-lg border border-white/10 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-display text-body">{date}</span>
                <button className="text-xs text-error hover:underline" onClick={() => cancelDate(date)}>Cancel &amp; notify</button>
              </div>
              {list.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-2 py-1 text-sm">
                  <span className="min-w-0 truncate text-body">{b.member_name} <span className="text-xs text-muted">{b.status}</span></span>
                  <span className="flex shrink-0 gap-2 text-xs">
                    {b.status === 'waitlisted' && (
                      <button className="text-accent hover:underline" onClick={() => act({ op: 'promote', booking_id: b.id }, 'Promoted from waitlist.')}>Promote</button>
                    )}
                    {b.status === 'booked' && (
                      <>
                        <button className="text-success hover:underline" onClick={() => act({ op: 'mark', booking_id: b.id, status: 'attended' }, 'Marked attended.')}>Attended</button>
                        <button className="text-error hover:underline" onClick={() => act({ op: 'mark', booking_id: b.id, status: 'no_show' }, 'Marked no-show.')}>No-show</button>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {bookings && bookings.length > 0 && (
          <div className="space-y-2 border-t border-white/10 pt-3">
            <textarea className="field min-h-[60px]" placeholder="Message to booked members…" value={notice} onChange={(e) => setNotice(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              {Object.keys(byDate).map((date) => (
                <button key={date} className="btn-outline px-3 py-1 text-xs" onClick={() => notifyDate(date)}>
                  Notify {date}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
