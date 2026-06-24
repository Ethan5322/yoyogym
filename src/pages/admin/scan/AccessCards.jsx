// Corporate access cards shown after a face scan (Phase 99 §A2/A3/A4).
import { apiFetch } from '../../../lib/api.js';
import { useState } from 'react';

const zar = (n) => 'R' + Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 });
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : '—');

const TIER = {
  basic: { label: 'BASIC', cls: 'bg-gray-500 text-white' },
  standard: { label: 'STANDARD', cls: 'bg-blue-500 text-white' },
  premium: { label: 'PREMIUM', cls: 'bg-yellow-500 text-black' },
  vip: { label: 'VIP', cls: 'bg-zinc-300 text-black' },
};
const STATUS = {
  active: { label: 'ACTIVE', cls: 'bg-success/20 text-success' },
  expiring: { label: 'EXPIRING SOON', cls: 'bg-orange-500/20 text-orange-400' },
  suspended: { label: 'SUSPENDED', cls: 'bg-error/20 text-error' },
  lapsed: { label: 'EXPIRED', cls: 'bg-red-900/40 text-red-400' },
  new: { label: 'PENDING PAYMENT', cls: 'bg-orange-500/20 text-orange-400' },
};
const BANNER = {
  on_schedule: { label: 'ON SCHEDULE TODAY', cls: 'bg-success text-black' },
  extra: { label: 'EXTRA VISIT', cls: 'bg-orange-500 text-black' },
  violation: { label: 'SCHEDULE VIOLATION', cls: 'bg-error text-white' },
  not_scheduled: { label: 'NOT SCHEDULED TODAY', cls: 'bg-gray-600 text-white' },
};
const ADHERENCE = {
  excellent: 'bg-success/20 text-success',
  good: 'bg-blue-500/20 text-blue-400',
  needs: 'bg-yellow-500/20 text-yellow-400',
  at_risk: 'bg-error/20 text-error',
};
const dur = (m) => (m == null ? '—' : `${Math.floor(m / 60)}h ${m % 60}m`);

function Badge({ map, key: k }) {
  const v = map[k] || { label: k?.toUpperCase?.() || '—', cls: 'bg-gray-600 text-white' };
  return <span className={`rounded-md px-2.5 py-1 text-xs font-bold tracking-wide ${v.cls}`}>{v.label}</span>;
}

export function MemberAccessCard({ data, onAction, onClose, busy, actionMsg, flagged }) {
  const m = data.member;
  const ms = data.membership || {};
  const t = data.today || {};
  const banner = BANNER[data.schedule?.banner] || BANNER.on_schedule;
  const adh = data.adherence;

  return (
    <div className="animate-slide-up mx-auto max-w-md overflow-hidden rounded-3xl border border-white/10 bg-surface shadow-2xl">
      {/* identity */}
      <div className="flex items-center gap-4 bg-elevated p-5">
        {m.photo_url ? (
          <img src={m.photo_url} alt="" className="h-20 w-20 rounded-full border-2 border-accent object-cover" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-accent bg-bg text-2xl text-accent">
            {m.full_name?.[0]}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-2xl uppercase text-body">{m.full_name}</div>
          <div className="text-sm text-muted">{m.membership_number}</div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Badge map={TIER} key={ms.tier} />
            <Badge map={STATUS} key={m.status} />
            {adh && (
              <span className={`rounded-md px-2.5 py-1 text-xs font-bold tracking-wide ${ADHERENCE[adh.band]}`}>
                {adh.score}% · {adh.label}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* schedule banner */}
      <div className={`px-5 py-3 text-center font-display text-lg uppercase tracking-wider ${banner.cls}`}>
        {banner.label}
      </div>

      {/* time tracking */}
      <div className="grid grid-cols-2 gap-px bg-white/5 text-center">
        <Cell label="Scheduled" value={data.schedule?.slot_label} />
        <Cell label="Checked in" value={t.checked_in_at ? fmtTime(t.checked_in_at) : 'Not yet'} />
        <Cell label="Time inside" value={t.inside ? dur(t.time_inside_min) : '—'} />
        <Cell
          label={t.overtime_min > 0 ? 'Overtime' : 'Time left'}
          value={t.inside ? (t.overtime_min > 0 ? `+${dur(t.overtime_min)}` : dur(t.time_remaining_min)) : '—'}
          danger={t.overtime_min > 0}
        />
      </div>

      {/* membership details */}
      <div className="space-y-1.5 p-5 text-sm">
        <Row label="Plan" value={`${ms.plan_name || '—'}${ms.monthly_amount ? ` · ${zar(ms.monthly_amount)}/mo` : ''}`} />
        {ms.contract_duration && <Row label="Contract" value={`${ms.contract_duration.replace(/_/g, ' ')} · ends ${fmtDate(ms.end_date)}`} />}
        {ms.days_remaining != null && <Row label="Days remaining" value={`${ms.days_remaining} days`} />}
        {ms.next_billing_date && <Row label="Next payment" value={`${fmtDate(ms.next_billing_date)} · ${zar(ms.monthly_amount)}`} />}
        <Row
          label="Payment"
          value={data.payment.up_to_date ? 'Up to date' : `Owes ${zar(data.payment.outstanding)}`}
          danger={!data.payment.up_to_date}
        />
        <Row label="Visits this month" value={`${data.month.visits}`} />
        {ms.sessions_total ? <Row label="Sessions" value={`${ms.sessions_remaining}/${ms.sessions_total}`} /> : null}
        <Row label="Medical aid" value={m.has_medical_aid ? m.medical_aid_provider || 'Yes' : 'No'} />
        {m.parq_flag && <Row label="PAR-Q" value="⚠ Medical clearance required" danger />}
        <Row label="Emergency" value={`${m.emergency_name || '—'} ${m.emergency_phone || ''}`} />
      </div>

      {actionMsg && <p className="px-5 pb-2 text-center text-sm text-success">{actionMsg}</p>}

      {/* extra-visit / violation approval (after a flagged check-in) */}
      {flagged && flagged !== 'ok' && (
        <div className="mx-5 mb-2 rounded-xl bg-orange-500/10 p-3 text-center">
          <p className="text-sm text-orange-300">This check-in was flagged: <b>{flagged}</b>. Approve or deny?</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button className="btn-primary" disabled={busy} onClick={() => onAction('approve_visit')}>Approve</button>
            <button className="btn-outline" disabled={busy} onClick={() => onAction('deny_visit')}>Deny</button>
          </div>
        </div>
      )}

      {/* quick actions */}
      <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-4">
        {t.inside ? (
          <button className="btn-outline" disabled={busy} onClick={() => onAction('checkout')}>Check Out</button>
        ) : (
          <button className="btn-primary" disabled={busy} onClick={() => onAction('checkin')}>Check In</button>
        )}
        <button className="btn-outline" disabled={busy} onClick={() => onAction('flag')}>Flag Issue</button>
        <a className="btn-outline text-center" href={`/admin/members/${m.id}`}>Full Profile</a>
        <a className="btn-outline text-center" href={m.phone ? `https://wa.me/${m.phone.replace(/[^0-9]/g, '')}` : '#'} target="_blank" rel="noreferrer">Message</a>
      </div>
      <button onClick={onClose} className="w-full border-t border-white/10 py-3 text-sm text-muted hover:text-body">
        Scan another
      </button>
    </div>
  );
}

export function TrainerCard({ data, onClose }) {
  const t = data.trainer;
  const shift = data.shift?.status === 'on_shift';
  return (
    <div className="animate-slide-up mx-auto max-w-md overflow-hidden rounded-3xl border border-white/10 bg-surface shadow-2xl">
      <div className="flex items-center gap-4 bg-elevated p-5">
        {t.photo_url ? (
          <img src={t.photo_url} alt="" className="h-20 w-20 rounded-full border-2 border-blue-400 object-cover" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-blue-400 bg-bg text-2xl text-blue-400">{t.full_name?.[0]}</div>
        )}
        <div>
          <div className="font-display text-2xl uppercase text-body">{t.full_name}</div>
          <div className="text-sm text-muted">Trainer{t.specialization ? ` · ${t.specialization}` : ''}</div>
          <span className={`mt-1.5 inline-block rounded-md px-2.5 py-1 text-xs font-bold ${shift ? 'bg-success/20 text-success' : 'bg-gray-600 text-white'}`}>
            {shift ? 'ON SHIFT' : 'OFF SHIFT'}
          </span>
        </div>
      </div>
      <div className="p-5 text-sm">
        <h3 className="mb-2 font-display uppercase tracking-wider text-blue-400">Today’s Classes</h3>
        {data.today.classes.length ? data.today.classes.map((c, i) => (
          <Row key={i} label={c.start_time?.slice(0, 5) || ''} value={c.name} />
        )) : <p className="text-muted">No classes today.</p>}
        <h3 className="mb-2 mt-4 font-display uppercase tracking-wider text-blue-400">Clients Today</h3>
        {data.today.clients.length ? data.today.clients.map((c, i) => (
          <Row key={i} label={c.name} value={c.completed ? 'done' : 'scheduled'} />
        )) : <p className="text-muted">No PT sessions today.</p>}
        {t.certifications && <p className="mt-4 text-xs text-muted">Certifications: {t.certifications}</p>}
      </div>
      <button onClick={onClose} className="w-full border-t border-white/10 py-3 text-sm text-muted hover:text-body">Scan another</button>
    </div>
  );
}

export function Unidentified({ onClose }) {
  return (
    <div className="animate-slide-up mx-auto max-w-md rounded-3xl border border-error/40 bg-error/10 p-6 text-center">
      <div className="text-5xl">⚠️</div>
      <h2 className="mt-3 font-display text-2xl uppercase text-error">Unidentified Person</h2>
      <p className="mt-1 text-sm text-muted">This person is not registered in the system.</p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <a className="btn-outline text-center" href="/admin/members">Search Member</a>
        <a className="btn-primary text-center" href="/admin/register-member">Register New</a>
        <a className="btn-outline text-center" href="/admin/visitors">Visitor Pass</a>
        <a className="btn-outline text-center" href="/admin/incidents">Report Incident</a>
      </div>
      <button onClick={onClose} className="mt-4 text-sm text-muted hover:text-body">Scan again</button>
    </div>
  );
}

function Cell({ label, value, danger }) {
  return (
    <div className="bg-surface px-3 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`font-display text-lg ${danger ? 'text-error' : 'text-body'}`}>{value || '—'}</div>
    </div>
  );
}
function Row({ label, value, danger }) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <span className="text-muted">{label}</span>
      <span className={`text-right ${danger ? 'text-error' : 'text-body'}`}>{value}</span>
    </div>
  );
}
