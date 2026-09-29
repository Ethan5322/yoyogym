// Rewards and streaks (CLAUDE.md §41.1 Q3). The owner sets how members earn
// points and what they can claim; the desk hands claims over and marks them.
// Points are counted from check-ins — nothing here can be typed in by hand.
import { useEffect, useState } from 'react';
import AdminShell from '../../components/AdminShell.jsx';
import { StatusPill } from '../../components/ui.jsx';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../../lib/toast.jsx';

const blank = { name: '', description: '', points: 100 };
const when = (d) => new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });

export default function Rewards() {
  const { user } = useAuth();
  const toast = useToast();
  const manage = ['owner', 'manager'].includes(user?.role);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [rules, setRules] = useState(null);

  function load() {
    apiFetch('/admin/rewards')
      .then((d) => {
        setData(d);
        setRules(d.rules);
      })
      .catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function run(fn, done) {
    try {
      await fn();
      toast.success(done);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  }

  const saveReward = () =>
    run(async () => {
      const body = { ...form, points: Number(form.points) };
      if (form.id) await apiFetch('/admin/rewards', { method: 'PATCH', body });
      else await apiFetch('/admin/rewards', { method: 'POST', body });
      setForm(null);
    }, 'Reward saved.');

  const saveRules = () =>
    run(() => apiFetch('/admin/settings', { method: 'PUT', body: { key: 'reward_rules', value: rules, category: 'services' } }), 'Saved.');

  const decide = (id, status) =>
    run(() => apiFetch('/admin/rewards', { method: 'POST', body: { action: 'claim', id, status } }), status === 'given' ? 'Marked as given.' : 'Claim cancelled.');

  if (error) return <AdminShell><p className="text-error">{error}</p></AdminShell>;
  if (!data) return <AdminShell><p className="text-muted">Loading…</p></AdminShell>;

  const waiting = data.claims.filter((c) => c.status === 'pending');

  return (
    <AdminShell>
      <h1 className="font-body text-3xl font-extrabold normal-case tracking-tight text-body">Rewards</h1>
      <p className="mt-1 max-w-2xl text-muted">
        Members earn points for every check-in and badges for visits and weeks in a row, then claim a reward in the app
        and collect it here. Points are counted from real check-ins.
      </p>

      <section className="card mt-6">
        <h2 className="mb-3 font-body text-xs font-bold uppercase tracking-[0.14em] text-muted">Waiting at the desk ({waiting.length})</h2>
        {waiting.length ? waiting.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 py-3 first:border-t-0">
            <div>
              <div className="font-semibold text-body">{c.reward_name}</div>
              <div className="text-sm text-muted">{c.member_name} · {c.membership_number} · {c.points} points · {when(c.created_at)}</div>
            </div>
            <div className="flex gap-2">
              <button className="btn-primary min-h-[44px] px-5 text-sm" onClick={() => decide(c.id, 'given')}>Given</button>
              <button className="btn-outline min-h-[44px] px-5 text-sm" onClick={() => decide(c.id, 'cancelled')}>Cancel</button>
            </div>
          </div>
        )) : <p className="text-sm text-muted">Nothing waiting.</p>}
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-body text-xs font-bold uppercase tracking-[0.14em] text-muted">What members can claim</h2>
            {manage && <button className="btn-primary min-h-[44px] px-5 text-sm" onClick={() => setForm({ ...blank })}>Add reward</button>}
          </div>
          {data.rewards.length ? data.rewards.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 border-t border-white/5 py-3 first:border-t-0">
              <div>
                <div className="font-semibold text-body">{r.name} {!r.is_enabled && <span className="text-xs text-muted">· off</span>}</div>
                <div className="text-sm text-muted">{r.points} points{r.description ? ` · ${r.description}` : ''}</div>
              </div>
              {manage && (
                <div className="flex gap-2">
                  <button className="btn-outline min-h-[40px] px-4 text-sm" onClick={() => setForm({ ...r })}>Edit</button>
                  <button className="btn-outline min-h-[40px] px-4 text-sm"
                    onClick={() => run(() => apiFetch('/admin/rewards', { method: 'PATCH', body: { id: r.id, is_enabled: !r.is_enabled } }), r.is_enabled ? 'Switched off.' : 'Switched on.')}>
                    {r.is_enabled ? 'Switch off' : 'Switch on'}
                  </button>
                </div>
              )}
            </div>
          )) : <p className="text-sm text-muted">No rewards yet. Add one — a free shake, a towel, a PT session.</p>}

          {form && (
            <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 p-4">
              <label className="text-sm text-muted">Name<input className="field mt-1" value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label className="text-sm text-muted">Description (optional)<input className="field mt-1" value={form.description || ''} maxLength={300} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
              <label className="text-sm text-muted">Points needed<input className="field mt-1" type="number" min={1} value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} /></label>
              <div className="flex gap-2">
                <button className="btn-primary min-h-[44px] px-5 text-sm" onClick={saveReward}>Save</button>
                <button className="btn-outline min-h-[44px] px-5 text-sm" onClick={() => setForm(null)}>Cancel</button>
              </div>
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="mb-3 font-body text-xs font-bold uppercase tracking-[0.14em] text-muted">How points are earned</h2>
          {rules && (
            <div className="grid gap-3">
              <label className="text-sm text-muted">Points for each check-in
                <input className="field mt-1" type="number" min={1} max={1000} disabled={!manage} value={rules.points_per_visit}
                  onChange={(e) => setRules({ ...rules, points_per_visit: e.target.value })} />
              </label>
              <label className="text-sm text-muted">Visits in a week that keep a streak going
                <input className="field mt-1" type="number" min={1} max={7} disabled={!manage} value={rules.streak_target}
                  onChange={(e) => setRules({ ...rules, streak_target: e.target.value })} />
              </label>
              {manage && <button className="btn-primary min-h-[44px] justify-self-start px-5 text-sm" onClick={saveRules}>Save</button>}
            </div>
          )}
          <p className="mt-3 text-xs text-muted">Badges: first visit, 10, 25, 50, 100 and 250 visits; 4, 12, 26 and 52 weeks in a row.</p>
        </section>
      </div>

      <section className="card mt-6">
        <h2 className="mb-3 font-body text-xs font-bold uppercase tracking-[0.14em] text-muted">Recent claims</h2>
        {data.claims.filter((c) => c.status !== 'pending').slice(0, 20).map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 border-t border-white/5 py-2.5 text-sm first:border-t-0">
            <span className="text-body">{c.reward_name} <span className="text-muted">· {c.member_name}</span></span>
            <span className="flex items-center gap-3 text-muted">{when(c.created_at)} <StatusPill status={c.status === 'given' ? 'active' : 'inactive'}>{c.status}</StatusPill></span>
          </div>
        ))}
        {!data.claims.some((c) => c.status !== 'pending') && <p className="text-sm text-muted">No claims yet.</p>}
      </section>
    </AdminShell>
  );
}
