// Calendar & schedule (spec 4.11): weekly grid of recurring classes,
// colour-coded. Reuses the classes endpoint (no extra API needed).
import { useEffect, useState } from 'react';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dayIndex = (d) => (d === 0 ? 6 : d - 1); // JS Sunday=0 -> last column

export default function CalendarAdmin() {
  const [classes, setClasses] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    apiFetch('/admin/classes').then((d) => setClasses(d.classes)).catch((e) => setError(e.message));
  }, []);

  const byDay = Array.from({ length: 7 }, () => []);
  for (const c of classes) {
    if (c.recurrence === 'recurring' && c.day_of_week != null) {
      byDay[dayIndex(c.day_of_week)].push(c);
    }
  }
  byDay.forEach((list) => list.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')));

  return (
    <AdminShell>
      <h1 className="text-2xl font-bold uppercase text-body">Calendar</h1>
      {error && <p className="mt-4 text-error">{error}</p>}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {DOW.map((d, i) => (
          <div key={d} className="card min-h-[120px]">
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
      <p className="mt-4 text-xs text-muted">Recurring classes shown. One-off events &amp; blocked days can be added in a later iteration.</p>
    </AdminShell>
  );
}
