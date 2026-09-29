// A member's pause and their family or group, on their page in the gym admin
// panel (CLAUDE.md §41.1 Q3). Each card appears only when the gym offers the
// service; the server checks the plan again on every call.
import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';

const fmt = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

function Card({ title, children }) {
  return (
    <div className="card">
      <h2 className="mb-3 font-display text-sm uppercase tracking-wider text-accent">{title}</h2>
      {children}
    </div>
  );
}

/** The member's pause: the one running, a way to end it or start one, and the history. */
export function PauseCard({ memberId, status, onChange }) {
  const toast = useToast();
  const [pauses, setPauses] = useState(null);
  const [days, setDays] = useState(14);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  function load() {
    apiFetch(`/admin/pauses?member_id=${encodeURIComponent(memberId)}`)
      .then((d) => setPauses(d.pauses || []))
      .catch(() => setPauses([]));
  }
  useEffect(load, [memberId]);

  const running = (pauses || []).find((p) => !p.resumed_at && p.starts_on <= today && p.ends_on >= today);

  async function send(body, done) {
    setBusy(true);
    try {
      await apiFetch('/admin/pauses', { method: 'POST', body });
      toast.success(done);
      load();
      onChange?.();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Pause">
      {pauses === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : running ? (
        <div className="space-y-3">
          <p className="text-sm text-body">
            Paused until <b>{fmt(running.ends_on)}</b> ({running.days} days{running.created_by === 'member' ? ', from the app' : ''}).
            They cannot check in until then; their end date has moved on by {running.days} days.
          </p>
          <button className="btn-outline min-h-[44px] px-5 text-sm" disabled={busy}
            onClick={() => window.confirm('End this pause today? Unused days come back off their end date.') && send({ action: 'end', pause_id: running.id }, 'Pause ended.')}>
            End pause now
          </button>
        </div>
      ) : status === 'active' ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-muted">Days
            <input className="field mt-1 w-24" type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} />
          </label>
          <label className="min-w-[180px] flex-1 text-sm text-muted">Reason (optional)
            <input className="field mt-1" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. travelling, injury" />
          </label>
          <button className="btn-primary min-h-[44px] px-5 text-sm" disabled={busy}
            onClick={() => send({ member_id: memberId, days, reason }, `Paused for ${days} days.`)}>
            Pause membership
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted">Only an active membership can be paused.</p>
      )}

      {(pauses || []).length > 0 && (
        <div className="mt-4 border-t border-white/5 pt-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">History</p>
          {pauses.slice(0, 6).map((p) => (
            <div key={p.id} className="flex justify-between gap-3 py-1 text-sm">
              <span className="text-body">{fmt(p.starts_on)} → {fmt(p.ends_on)}</span>
              <span className="text-muted">{p.days} days · {p.resumed_at ? 'ended' : p.ends_on < today ? 'finished' : 'running'}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** The member's family or group: who is in it, who pays, and the controls. */
export function FamilyCard({ memberId, memberName }) {
  const toast = useToast();
  const [state, setState] = useState(null);
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState('family');
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch(`/admin/member-groups?member_id=${encodeURIComponent(memberId)}`)
      .then((d) => setState(d))
      .catch(() => setState({ group: null, pricing: null }));
  }
  useEffect(load, [memberId]);

  async function send(body, done) {
    setBusy(true);
    try {
      await apiFetch('/admin/member-groups', { method: 'POST', body });
      toast.success(done);
      setNumber('');
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (state === null) return <Card title="Family / group"><p className="text-sm text-muted">Loading…</p></Card>;
  const g = state.group;
  const pricing = state.pricing || {};

  if (!g) {
    return (
      <Card title="Family / group">
        <p className="mb-3 text-sm text-muted">
          Not in a family or group. Start one with {memberName || 'this member'} as the payer; extra members get
          {' '}{pricing.family_discount_pct ?? 0}% off as a family, {pricing.group_discount_pct ?? 0}% as a group.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[160px] flex-1 text-sm text-muted">Name
            <input className="field mt-1" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Dube family" />
          </label>
          <label className="text-sm text-muted">Kind
            <select className="field mt-1 w-32" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="family">Family</option>
              <option value="group">Group</option>
            </select>
          </label>
          <button className="btn-primary min-h-[44px] px-5 text-sm" disabled={busy || !name.trim()}
            onClick={() => send({ action: 'create', name, kind, member_id: memberId }, 'Started.')}>
            Start
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card title={`${g.kind === 'group' ? 'Group' : 'Family'}: ${g.name}`}>
      <div className="space-y-2">
        {g.members.map((m) => (
          <div key={m.member_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-body">
              {m.full_name} <span className="text-muted">· {m.membership_number}</span>
              {m.is_payer && <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-bold text-accent">Pays</span>}
            </span>
            <span className="flex gap-3">
              {!m.is_payer && (
                <button className="text-xs text-accent hover:underline" disabled={busy}
                  onClick={() => send({ action: 'payer', group_id: g.id, member_id: m.member_id }, 'Payer changed.')}>
                  Make payer
                </button>
              )}
              <button className="text-xs text-muted hover:text-error" disabled={busy}
                onClick={() => window.confirm(`Remove ${m.full_name}?`) && send({ action: 'remove', group_id: g.id, member_id: m.member_id }, 'Removed.')}>
                Remove
              </button>
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        Extra members get {g.kind === 'group' ? pricing.group_discount_pct : pricing.family_discount_pct}% off. Up to {pricing.max_members} members.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="min-w-[180px] flex-1 text-sm text-muted">Add by membership number
          <input className="field mt-1" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="GYM-2026-000123" />
        </label>
        <button className="btn-outline min-h-[44px] px-5 text-sm" disabled={busy || !number.trim()}
          onClick={() => send({ action: 'add', group_id: g.id, membership_number: number }, 'Added.')}>
          Add
        </button>
      </div>
    </Card>
  );
}
