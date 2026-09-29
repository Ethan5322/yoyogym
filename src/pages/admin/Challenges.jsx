// Challenges (CLAUDE.md §41.1 Q3). The owner sets a target number of visits
// between two dates; members join in the app and progress is counted from
// their real check-ins.
import { useEffect, useState } from 'react';
import AdminShell from '../../components/AdminShell.jsx';
import { StatusPill } from '../../components/ui.jsx';
import { apiFetch } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';

const iso = (d) => d.toISOString().slice(0, 10);
const fmt = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
const STATE_TONE = { running: 'active', upcoming: 'new', ended: 'inactive' };

function monthBlank() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  return { title: '', description: '', target_visits: 12, starts_on: iso(first), ends_on: iso(last) };
}

export default function Challenges() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [open, setOpen] = useState(null);

  function load() {
    apiFetch('/admin/challenges').then((d) => setList(d.challenges || [])).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function save() {
    try {
      const body = { ...form, target_visits: Number(form.target_visits) };
      if (form.id) await apiFetch('/admin/challenges', { method: 'PATCH', body });
      else await apiFetch('/admin/challenges', { method: 'POST', body });
      toast.success('Challenge saved.');
      setForm(null);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function show(c) {
    if (open?.challenge?.id === c.id) return setOpen(null);
    try {
      setOpen(await apiFetch(`/admin/challenges?id=${c.id}`));
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function end(c) {
    if (!window.confirm(`End "${c.title}" now? Members keep what they achieved.`)) return;
    try {
      await apiFetch('/admin/challenges', { method: 'PATCH', body: { id: c.id, is_active: false } });
      load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  if (error) return <AdminShell><p className="text-error">{error}</p></AdminShell>;

  return (
    <AdminShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-body text-3xl font-extrabold normal-case tracking-tight text-body">Challenges</h1>
          <p className="mt-1 max-w-2xl text-muted">
            Set a number of visits between two dates. Members join in the app, see their progress and an opt-in
            leaderboard (first name and initial only).
          </p>
        </div>
        <button className="btn-primary min-h-[44px] px-5 text-sm" onClick={() => setForm(monthBlank())}>New challenge</button>
      </div>

      {form && (
        <section className="card mt-6 grid gap-3">
          <label className="text-sm text-muted">Title<input className="field mt-1" value={form.title} maxLength={100} placeholder="e.g. 12 visits in October" onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label className="text-sm text-muted">Description (optional)<input className="field mt-1" value={form.description || ''} maxLength={400} placeholder="What finishers get, if anything" onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm text-muted">Visits to finish<input className="field mt-1" type="number" min={1} max={365} value={form.target_visits} onChange={(e) => setForm({ ...form, target_visits: e.target.value })} /></label>
            <label className="text-sm text-muted">Starts<input className="field mt-1" type="date" value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} /></label>
            <label className="text-sm text-muted">Ends<input className="field mt-1" type="date" value={form.ends_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} /></label>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary min-h-[44px] px-5 text-sm" onClick={save}>Save</button>
            <button className="btn-outline min-h-[44px] px-5 text-sm" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </section>
      )}

      <section className="mt-6 space-y-3">
        {list === null ? <p className="text-muted">Loading…</p> : list.length === 0 ? (
          <div className="card text-muted">No challenges yet. A monthly visits challenge is a good first one.</div>
        ) : list.map((c) => (
          <div key={c.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 font-semibold text-body">{c.title} <StatusPill status={STATE_TONE[c.state]}>{c.state}</StatusPill></div>
                <div className="text-sm text-muted">{c.target_visits} visits · {fmt(c.starts_on)} → {fmt(c.ends_on)}</div>
                <div className="mt-1 text-sm text-body">{c.joined} joined · {c.finished} finished</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-outline min-h-[40px] px-4 text-sm" onClick={() => show(c)}>{open?.challenge?.id === c.id ? 'Hide' : 'Who joined'}</button>
                {c.state !== 'ended' && <button className="btn-outline min-h-[40px] px-4 text-sm" onClick={() => setForm({ ...c })}>Edit</button>}
                {c.state !== 'ended' && <button className="btn-outline min-h-[40px] px-4 text-sm" onClick={() => end(c)}>End now</button>}
              </div>
            </div>
            {open?.challenge?.id === c.id && (
              <div className="mt-4 border-t border-white/5 pt-3">
                {open.entries.length ? open.entries.map((e) => (
                  <div key={e.member_id} className="flex justify-between gap-3 py-1.5 text-sm">
                    <span className="text-body">{e.full_name} <span className="text-muted">· {e.membership_number}</span>{!e.show_on_board && <span className="text-muted"> · not on the board</span>}</span>
                    <span className={e.done ? 'font-semibold text-success' : 'text-muted'}>{e.progress} / {c.target_visits}{e.done ? ' ✓' : ''}</span>
                  </div>
                )) : <p className="text-sm text-muted">Nobody has joined yet.</p>}
              </div>
            )}
          </div>
        ))}
      </section>
    </AdminShell>
  );
}
