// Calendar & schedule (spec 4.11): weekly recurring-class grid + upcoming
// special events / promotions / blocked days (colour-coded), with add/delete.
import { useEffect, useState } from 'react';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dayIndex = (d) => (d === 0 ? 6 : d - 1);
const fmt = (d) => new Date(d).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });

const TYPE_COLOR = {
  event: 'border-orange-400',
  promotion: 'border-orange-400',
  blocked: 'border-gray-500',
};

export default function CalendarAdmin() {
  const [classes, setClasses] = useState([]);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [eventsErr, setEventsErr] = useState('');
  const [form, setForm] = useState({ title: '', type: 'event', event_date: '', start_time: '', description: '' });

  function loadEvents() {
    const today = new Date().toISOString().slice(0, 10);
    apiFetch(`/admin/events?from=${today}`).then((d) => setEvents(d.events)).catch((e) => setEventsErr(e.message));
  }
  useEffect(() => {
    apiFetch('/admin/classes').then((d) => setClasses(d.classes)).catch((e) => setError(e.message));
    loadEvents();
  }, []);

  async function addEvent() {
    if (!form.title || !form.event_date) return;
    try {
      await apiFetch('/admin/events', { method: 'POST', body: form });
      setForm({ title: '', type: 'event', event_date: '', start_time: '', description: '' });
      loadEvents();
    } catch (e) {
      setEventsErr(e.message);
    }
  }
  async function delEvent(id) {
    await apiFetch(`/admin/events?id=${id}`, { method: 'DELETE' });
    loadEvents();
  }

  const byDay = Array.from({ length: 7 }, () => []);
  for (const c of classes) {
    if (c.recurrence === 'recurring' && c.day_of_week != null) byDay[dayIndex(c.day_of_week)].push(c);
  }
  byDay.forEach((l) => l.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')));

  return (
    <AdminShell>
      <h1 className="text-2xl font-bold uppercase text-body">Calendar</h1>
      {error && <p className="mt-4 text-error">{error}</p>}

      <h2 className="mt-4 font-display uppercase text-accent">Weekly Classes</h2>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {DOW.map((d, i) => (
          <div key={d} className="card min-h-[110px]">
            <h3 className="mb-2 font-display text-sm uppercase tracking-wider text-accent">{d}</h3>
            <div className="space-y-2">
              {byDay[i].length ? byDay[i].map((c) => (
                <div key={c.id} className="rounded border-l-2 border-blue-400 bg-elevated px-2 py-1 text-xs">
                  <div className="text-body">{c.start_time?.slice(0, 5)} {c.name}</div>
                  <div className="text-muted">{c.trainers?.full_name || ''}</div>
                </div>
              )) : <p className="text-xs text-muted">—</p>}
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-8 font-display uppercase text-accent">Events &amp; Blocked Days</h2>
      {eventsErr && (
        <p className="mt-2 rounded bg-error/10 px-3 py-2 text-sm text-error">
          {eventsErr.includes('events') ? 'Run the events table SQL in Supabase to enable this section.' : eventsErr}
        </p>
      )}

      <div className="card mt-2 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input className="field" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <select className="field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="event">Event</option>
            <option value="promotion">Promotion</option>
            <option value="blocked">Blocked / Closed</option>
          </select>
          <input className="field" type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
          <input className="field" type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
        </div>
        <button className="btn-primary px-4 py-2 text-sm" onClick={addEvent}>Add to calendar</button>
      </div>

      <div className="mt-3 space-y-2">
        {events.map((ev) => (
          <div key={ev.id} className={`card flex items-center justify-between border-l-4 ${TYPE_COLOR[ev.type] || 'border-orange-400'}`}>
            <div>
              <div className="font-display text-body">{ev.title} <span className="text-xs uppercase text-muted">· {ev.type}</span></div>
              <div className="text-xs text-muted">{fmt(ev.event_date)}{ev.start_time ? ` · ${ev.start_time.slice(0, 5)}` : ''}</div>
            </div>
            <button className="text-sm text-error" onClick={() => delEvent(ev.id)}>Delete</button>
          </div>
        ))}
        {!events.length && !eventsErr && <p className="text-muted">No upcoming events.</p>}
      </div>

      <p className="mt-4 text-xs text-muted">
        <span className="text-blue-400">▮</span> Classes &nbsp;
        <span className="text-orange-400">▮</span> Events / Promotions &nbsp;
        <span className="text-gray-400">▮</span> Blocked days
      </p>
    </AdminShell>
  );
}
