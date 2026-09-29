// The four member services in the member portal (CLAUDE.md §41.1 Q3):
// rewards and challenges in their own tab; pausing and family under Status.
// Each part appears only when the gym offers it (plan, gym and owner).
import { useEffect, useState } from 'react';
import { memberFetch } from '../lib/memberApi.js';

const fmt = (d) => new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });

function useLoad(path) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const load = () => memberFetch(path).then(setData).catch((e) => setErr(e.message));
  useEffect(() => {
    load();
  }, [path]); // eslint-disable-line
  return { data, err, load };
}

// ---- Rewards -----------------------------------------------------------------

function RewardsPanel() {
  const { data, err, load } = useLoad('/member/rewards');
  const [note, setNote] = useState('');

  async function claim(r) {
    if (!confirm(`Claim "${r.name}" for ${r.points} points?`)) return;
    try {
      const d = await memberFetch('/member/rewards', { method: 'POST', body: { reward_id: r.id } });
      setNote(d.message);
      load();
    } catch (e) {
      setNote(e.message);
    }
  }

  if (err) return <p className="text-sm text-error">{err}</p>;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  const earned = data.badges.filter((b) => b.earned);

  return (
    <div className="space-y-4">
      <div className="card grid grid-cols-3 gap-2 text-center">
        <div><div className="text-2xl font-extrabold text-accent">{data.balance}</div><div className="text-xs text-muted">points</div></div>
        <div><div className="text-2xl font-extrabold text-body">{data.streak_weeks}</div><div className="text-xs text-muted">week streak</div></div>
        <div><div className="text-2xl font-extrabold text-body">{data.visits}</div><div className="text-xs text-muted">visits</div></div>
      </div>
      <p className="text-center text-xs text-muted">
        {data.points_per_visit} points a visit · a week counts at {data.streak_target} visits
        {data.next_badge ? ` · ${data.next_badge.visits_to_go} to go for “${data.next_badge.label}”` : ''}
      </p>

      <div className="card">
        <h3 className="mb-2 font-body text-xs font-bold uppercase tracking-[0.14em] text-muted">Badges</h3>
        <div className="flex flex-wrap gap-2">
          {data.badges.map((b) => (
            <span key={b.key} className={`rounded-full border px-3 py-1 text-xs ${b.earned ? 'border-accent/50 bg-accent/10 text-body' : 'border-white/10 text-muted opacity-60'}`}>
              {b.earned ? '★ ' : ''}{b.label}
            </span>
          ))}
        </div>
        {!earned.length && <p className="mt-2 text-xs text-muted">Your first check-in earns your first badge.</p>}
      </div>

      <div className="card">
        <h3 className="mb-2 font-body text-xs font-bold uppercase tracking-[0.14em] text-muted">Claim a reward</h3>
        {note && <p className="mb-2 text-sm text-accent">{note}</p>}
        {data.rewards.length ? data.rewards.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 border-t border-white/5 py-2.5 first:border-t-0">
            <div className="min-w-0">
              <div className="font-semibold text-body">{r.name}</div>
              <div className="text-xs text-muted">{r.points} points{r.description ? ` · ${r.description}` : ''}</div>
            </div>
            <button className={`${r.can_claim ? 'btn-primary' : 'btn-outline'} min-h-[40px] flex-none px-4 text-sm`} disabled={!r.can_claim} onClick={() => claim(r)}>
              {r.can_claim ? 'Claim' : `${r.points - data.balance} more`}
            </button>
          </div>
        )) : <p className="text-sm text-muted">Your gym has not added rewards yet.</p>}
        {data.claims.some((c) => c.status === 'pending') && (
          <p className="mt-3 text-xs text-muted">Waiting at the desk: {data.claims.filter((c) => c.status === 'pending').map((c) => c.reward_name).join(', ')}</p>
        )}
      </div>
    </div>
  );
}

// ---- Challenges --------------------------------------------------------------

function ChallengesPanel() {
  const { data, err, load } = useLoad('/member/challenges');
  const [note, setNote] = useState('');

  async function act(c, action, showOnBoard = true) {
    try {
      const d = await memberFetch('/member/challenges', { method: 'POST', body: { challenge_id: c.id, action, show_on_board: showOnBoard } });
      setNote(d.message || '');
      load();
    } catch (e) {
      setNote(e.message);
    }
  }

  if (err) return <p className="text-sm text-error">{err}</p>;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="space-y-4">
      {note && <p className="text-center text-sm text-accent">{note}</p>}
      {data.challenges.length ? data.challenges.map((c) => {
        const pct = Math.min(100, Math.round((c.progress / c.target_visits) * 100));
        return (
          <div key={c.id} className="card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-body">{c.title}</div>
                <div className="text-xs text-muted">{c.target_visits} visits · {fmt(c.starts_on)} – {fmt(c.ends_on)} · {c.people} taking part</div>
                {c.description && <p className="mt-1 text-sm text-muted">{c.description}</p>}
              </div>
              {c.state === 'upcoming' && <span className="rounded-full border border-white/15 px-2 py-0.5 text-xs text-muted">Soon</span>}
            </div>
            {c.joined ? (
              <>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><i className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} /></div>
                <div className="mt-1 text-xs text-muted">{c.done ? 'Done — well played!' : `${c.progress} of ${c.target_visits} visits`}</div>
                {c.board.length > 0 && (
                  <ol className="mt-3 space-y-1 text-sm">
                    {c.board.map((b) => (
                      <li key={b.rank} className={`flex justify-between ${b.you ? 'font-semibold text-accent' : 'text-body'}`}>
                        <span>{b.rank}. {b.name}{b.you ? ' (you)' : ''}</span><span>{b.progress}</span>
                      </li>
                    ))}
                  </ol>
                )}
                <button className="mt-3 text-xs text-muted hover:text-error" onClick={() => confirm('Leave this challenge?') && act(c, 'leave')}>Leave</button>
              </>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-primary min-h-[40px] px-4 text-sm" onClick={() => act(c, 'join', true)}>Join</button>
                <button className="btn-outline min-h-[40px] px-4 text-sm" onClick={() => act(c, 'join', false)}>Join, off the leaderboard</button>
              </div>
            )}
          </div>
        );
      }) : <div className="card text-center text-sm text-muted">No challenges running right now.</div>}
    </div>
  );
}

/** The Rewards tab: whichever of the two the gym offers. */
export function RewardsTab({ canUse }) {
  return (
    <div className="space-y-6">
      <h2 className="text-center font-display text-lg uppercase text-body">Rewards</h2>
      {canUse('rewards') && <RewardsPanel />}
      {canUse('challenges') && (
        <div>
          <h3 className="mb-3 text-center font-body text-xs font-bold uppercase tracking-[0.14em] text-muted">Challenges</h3>
          <ChallengesPanel />
        </div>
      )}
    </div>
  );
}

// ---- Pause -----------------------------------------------------------------

export function PausePanel() {
  const { data, err, load } = useLoad('/member/pause');
  const [days, setDays] = useState(14);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(body) {
    setBusy(true);
    try {
      const d = await memberFetch('/member/pause', { method: 'POST', body });
      setNote(d.message || '');
      load();
    } catch (e) {
      setNote(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (err || !data) return null;
  const r = data.rules;

  return (
    <div className="card">
      <h3 className="mb-2 font-body text-xs font-bold uppercase tracking-[0.14em] text-muted">Pause my membership</h3>
      {note && <p className="mb-2 text-sm text-accent">{note}</p>}
      {data.current ? (
        <>
          <p className="text-sm text-body">Paused until <b>{fmt(data.current.ends_on)}</b>. Your end date has moved on by {data.current.days} days.</p>
          <button className="btn-outline mt-3 min-h-[44px] px-5 text-sm" disabled={busy}
            onClick={() => confirm('Come back now? The days you did not use come off your end date.') && send({ action: 'resume' })}>
            I&apos;m back — end my pause
          </button>
        </>
      ) : data.can_pause ? (
        <>
          <p className="text-sm text-muted">
            Travelling or injured? Pause for {r.min_days}–{r.max_days} days; your end date moves on by the same. {data.left_this_year} left this year.
            {r.fee > 0 ? ` A fee of R${r.fee} is paid at reception.` : ''}
          </p>
          <div className="mt-3 flex items-end gap-2">
            <label className="text-sm text-muted">Days
              <input className="field mt-1 w-24" type="number" min={r.min_days} max={r.max_days} value={days} onChange={(e) => setDays(Number(e.target.value))} />
            </label>
            <button className="btn-primary min-h-[44px] px-5 text-sm" disabled={busy}
              onClick={() => confirm(`Pause for ${days} days from today? You cannot check in while paused.`) && send({ days })}>
              Pause
            </button>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted">
          {data.left_this_year === 0 ? `You have used your ${r.max_per_year} pauses for this year.` : 'Pausing opens once your membership is active.'}
        </p>
      )}
    </div>
  );
}

// ---- Family ------------------------------------------------------------------

export function FamilyPanel() {
  const { data, err } = useLoad('/member/family');
  if (err || !data?.group) return null;
  const g = data.group;
  return (
    <div className="card">
      <h3 className="mb-2 font-body text-xs font-bold uppercase tracking-[0.14em] text-muted">{g.kind === 'group' ? 'Your group' : 'Your family'}: {g.name}</h3>
      <div className="flex flex-wrap gap-2">
        {g.members.map((m, i) => (
          <span key={i} className={`rounded-full border px-3 py-1 text-sm ${m.is_you ? 'border-accent/50 text-accent' : 'border-white/15 text-body'}`}>
            {m.name}{m.is_you ? ' (you)' : ''}{m.is_payer ? ' · pays' : ''}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        {g.you_pay ? 'You pay for everyone.' : 'Paid for by the payer.'} Each extra member gets {g.discount_pct}% off. Everyone keeps their own card.
      </p>
    </div>
  );
}
