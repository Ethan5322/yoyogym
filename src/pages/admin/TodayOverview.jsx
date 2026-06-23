// Today's overview (spec 4.6): live check-ins, who's inside, today's classes.
import { useEffect, useState } from 'react';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';

const time = (d) => new Date(d).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });

export default function TodayOverview() {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  function load() {
    apiFetch('/admin/today').then(setD).catch((e) => setError(e.message));
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // refresh live
    return () => clearInterval(t);
  }, []);

  return (
    <AdminShell>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold uppercase text-body">Today</h1>
        <button className="btn-outline px-3 py-1 text-sm" onClick={load}>Refresh</button>
      </div>
      {error && <p className="mt-4 text-error">{error}</p>}
      {d && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="card"><div className="text-sm text-muted">Check-ins Today</div><div className="font-display text-3xl text-body">{d.total_checkins}</div></div>
            <div className="card"><div className="text-sm text-muted">Currently Inside</div><div className="font-display text-3xl text-success">{d.currently_inside}</div></div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="card">
              <h2 className="mb-3 font-display uppercase text-body">Check-in Timeline</h2>
              {d.checkins.length ? d.checkins.map((c, i) => (
                <div key={i} className="flex justify-between border-b border-white/5 py-2 text-sm">
                  <span className="text-body">{c.name} {c.inside && <span className="text-success">●</span>}</span>
                  <span className="text-muted">{time(c.at)}</span>
                </div>
              )) : <p className="text-sm text-muted">No check-ins yet today.</p>}
            </div>

            <div className="card">
              <h2 className="mb-3 font-display uppercase text-body">Today's Classes</h2>
              {d.classes.length ? d.classes.map((c) => (
                <div key={c.id} className="flex justify-between border-b border-white/5 py-2 text-sm">
                  <span className="text-body">{c.start_time?.slice(0, 5)} {c.name}{c.trainer ? ` · ${c.trainer}` : ''}</span>
                  <span className="text-muted">{c.booked}/{c.max_capacity}</span>
                </div>
              )) : <p className="text-sm text-muted">No classes scheduled today.</p>}
            </div>
          </div>
        </>
      )}
    </AdminShell>
  );
}
