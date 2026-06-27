// Existing member portal (spec 2.4): sign in with membership number + phone,
// then check in, view status, browse & book classes, and see history.
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { memberFetch, getMemberToken, setMemberToken, clearMemberToken } from '../lib/memberApi.js';
import { logQrScan } from '../lib/scan.js';
import PersonalQr from '../components/PersonalQr.jsx';
import IdCardButton from '../components/IdCardButton.jsx';
import FaceCapture from '../chatbot/components/FaceCapture.jsx';

export default function MemberPortal() {
  const [token, setTok] = useState(getMemberToken());
  const [member, setMember] = useState(null);
  const [tab, setTab] = useState('status');

  useEffect(() => logQrScan('existing_member'), []);

  function onLoggedIn(t, m) {
    setMemberToken(t);
    setTok(t);
    setMember(m);
  }
  function logout() {
    clearMemberToken();
    setTok(null);
    setMember(null);
  }

  if (!token) return <MemberLogin onLoggedIn={onLoggedIn} />;

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col bg-bg">
      <header className="flex items-center justify-between border-b border-white/5 bg-surface px-4 py-3">
        <span className="font-display text-lg uppercase tracking-wider text-body">My Gym</span>
        <button onClick={logout} className="text-xs text-muted hover:text-error">
          Sign out
        </button>
      </header>

      <nav className="grid grid-cols-4 border-b border-white/5 bg-surface text-xs">
        {[
          ['status', 'Status'],
          ['checkin', 'Check In'],
          ['classes', 'Classes'],
          ['history', 'History'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`py-3 font-display uppercase tracking-wide ${
              tab === key ? 'border-b-2 border-accent text-accent' : 'text-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className="flex-1 overflow-y-auto px-4 py-5">
        {tab === 'status' && <StatusTab />}
        {tab === 'checkin' && <CheckInTab />}
        {tab === 'classes' && <ClassesTab />}
        {tab === 'history' && <HistoryTab />}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------- login
function MemberLogin({ onLoggedIn }) {
  const [membership_number, setNum] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [faceMode, setFaceMode] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { token, member } = await memberFetch('/member/login', {
        method: 'POST',
        auth: false,
        body: { membership_number, phone },
      });
      onLoggedIn(token, member);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onFace(result) {
    if (!result?.descriptor) {
      setFaceMode(false);
      return;
    }
    setError('');
    setBusy(true);
    try {
      const { token, member } = await memberFetch('/member/face-login', {
        method: 'POST',
        auth: false,
        body: { descriptor: Array.from(result.descriptor) },
      });
      onLoggedIn(token, member);
    } catch (err) {
      setError(err.message || 'Face not recognised.');
      setFaceMode(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm animate-fade-up space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold uppercase text-body">Member Sign In</h1>
          <p className="mt-2 text-sm text-muted">
            {faceMode ? 'Look at the camera to sign in' : 'Use your face, or your membership number.'}
          </p>
        </div>

        {error && <p className="rounded-lg bg-error/10 px-3 py-2 text-sm text-error">{error}</p>}

        {faceMode ? (
          <div className="card space-y-3">
            <FaceCapture onSubmit={onFace} />
            <button className="w-full text-sm text-muted hover:text-body" onClick={() => setFaceMode(false)}>
              ← Use membership number instead
            </button>
          </div>
        ) : (
          <>
            <button className="btn-primary w-full" onClick={() => { setError(''); setFaceMode(true); }}>
              🛡️ Sign in with Face
            </button>
            <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted">
              <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
            </div>
            <form onSubmit={submit} className="space-y-4">
              <input
                className="field"
                placeholder="Membership number (GYM-2025-XXXXXX)"
                value={membership_number}
                onChange={(e) => setNum(e.target.value)}
                required
              />
              <input
                className="field"
                placeholder="Phone (+27…)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
              <button className="btn-outline w-full" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          </>
        )}

        <Link to="/" className="block text-center text-sm text-muted hover:text-body">
          ← Back
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- helpers
function useEndpoint(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    setLoading(true);
    memberFetch(path)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [path]);
  useEffect(() => reload(), [reload]);
  return { data, error, loading, reload };
}

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const ADH = {
  excellent: 'bg-success/20 text-success',
  good: 'bg-blue-500/20 text-blue-400',
  needs: 'bg-yellow-500/20 text-yellow-400',
  at_risk: 'bg-error/20 text-error',
};

// ---------------------------------------------------------------- status
function StatusTab() {
  const { data, loading, error } = useEndpoint('/member/status');
  if (loading) return <p className="text-muted">Loading…</p>;
  if (error) return <p className="text-error">{error}</p>;
  const m = data.membership;
  const badge = data.member?.status === 'active' ? 'text-success' : 'text-error';
  return (
    <div className="space-y-4">
      <div className="card">
        <div className="text-sm text-muted">Membership</div>
        <div className="font-display text-xl text-body">{m?.plan_name || '—'}</div>
        <div className={`mt-1 text-sm uppercase ${badge}`}>{data.member?.status}</div>
      </div>

      {data.adherence && (
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted">Schedule Adherence (30 days)</div>
              <div className="font-display text-3xl text-body">{data.adherence.score}%</div>
              <div className="text-xs text-muted">{data.adherence.visits_30d} of ~{data.adherence.expected_30d} expected visits</div>
            </div>
            <span className={`rounded-lg px-3 py-1.5 text-sm font-bold ${ADH[data.adherence.band]}`}>{data.adherence.label}</span>
          </div>
        </div>
      )}
      <div className="card space-y-2 text-sm">
        <Row label="Member No." value={data.member?.membership_number} />
        <Row label="Valid until" value={m?.end_date ? fmt(m.end_date) : 'Ongoing'} />
        {m?.sessions_total ? (
          <Row label="Sessions left" value={`${m.sessions_remaining}/${m.sessions_total}`} />
        ) : null}
        {m?.next_billing_date && <Row label="Next payment" value={fmt(m.next_billing_date)} />}
        {data.has_outstanding && (
          <Row label="Outstanding" value={`R${data.outstanding_balance.toFixed(2)}`} />
        )}
      </div>

      {data.has_outstanding && <PayBalance amount={data.outstanding_balance} />}

      {data.member?.parq_flag && (
        <p className="rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
          ⚠ Medical clearance required — please bring a doctor’s note.
        </p>
      )}

      {data.member?.membership_number && (
        <div className="card text-center">
          {data.member.photo_url && (
            <img src={data.member.photo_url} alt="" className="mx-auto mb-3 h-28 w-[84px] rounded object-cover gold-frame" />
          )}
          <p className="font-display text-lg uppercase text-body">Membership ID Card</p>
          <p className="mb-3 text-xs text-muted">Your photo, details &amp; QR — use it as your gym ID.</p>
          <IdCardButton
            member={{
              full_name: data.member.full_name,
              membership_number: data.member.membership_number,
              tier: m?.tier,
              valid_until: m?.end_date,
              photo_url: data.member.photo_url,
            }}
          />
        </div>
      )}

      {data.member?.membership_number && (
        <div className="card">
          <PersonalQr
            url={`${window.location.origin}/p/m/${data.member.membership_number}`}
            name={data.member.full_name || data.member.membership_number}
            label="My Member QR — show this to verify your membership"
          />
        </div>
      )}

      <DeletionRequest />
    </div>
  );
}

function PayBalance({ amount }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function pay() {
    setBusy(true);
    setErr('');
    try {
      const r = await memberFetch('/member/pay', {
        method: 'POST',
        body: { callback_url: `${window.location.origin}/payment/callback` },
      });
      if (r.authorization_url) window.location.href = r.authorization_url;
      else setErr('Could not start payment. Please try again.');
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }
  return (
    <div className="card text-center">
      <p className="font-display text-lg uppercase text-body">Settle your balance</p>
      <p className="mb-3 text-xs text-muted">Pay your outstanding R{Number(amount).toFixed(2)} securely online.</p>
      <button className="btn-primary w-full" onClick={pay} disabled={busy}>
        {busy ? 'Opening secure checkout…' : `Pay R${Number(amount).toFixed(2)} Now`}
      </button>
      {err && <p className="mt-2 text-sm text-error">{err}</p>}
    </div>
  );
}

function DeletionRequest() {
  const [msg, setMsg] = useState('');
  async function request() {
    if (!confirm('Request deletion of your personal data (POPIA)? Our team will action this.')) return;
    try {
      const r = await memberFetch('/member/request-deletion', { method: 'POST' });
      setMsg(r.message);
    } catch (e) {
      setMsg(e.message);
    }
  }
  return (
    <div className="pt-2 text-center">
      {msg ? (
        <p className="text-xs text-muted">{msg}</p>
      ) : (
        <button onClick={request} className="text-xs text-muted underline hover:text-error">
          Request data deletion (POPIA)
        </button>
      )}
    </div>
  );
}
function Row({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className="text-body">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------- check-in
function CheckInTab() {
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const r = await memberFetch('/member/checkin', { method: 'POST' });
      setMsg(r.message);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4 text-center">
      <p className="text-muted">Tap to log your attendance for today.</p>
      <button className="btn-primary w-full" onClick={go} disabled={busy}>
        {busy ? 'Checking in…' : 'Check In Now'}
      </button>
      {msg && <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{msg}</p>}
      {err && <p className="rounded-lg bg-error/10 px-3 py-2 text-sm text-error">{err}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- classes
function ClassesTab() {
  const { data, loading, error, reload } = useEndpoint('/member/classes');
  const [busyKey, setBusyKey] = useState(null);
  const [note, setNote] = useState('');

  async function book(o) {
    const key = `${o.class_id}|${o.session_date}`;
    setBusyKey(key);
    setNote('');
    try {
      const r = await memberFetch('/member/book-class', {
        method: 'POST',
        body: { class_id: o.class_id, session_date: o.session_date },
      });
      setNote(r.message);
      reload();
    } catch (e) {
      setNote(e.message);
    } finally {
      setBusyKey(null);
    }
  }

  async function cancel(o) {
    const key = `${o.class_id}|${o.session_date}`;
    setBusyKey(key);
    setNote('');
    try {
      const r = await memberFetch('/member/cancel-booking', {
        method: 'POST',
        body: { class_id: o.class_id, session_date: o.session_date },
      });
      setNote(r.message);
      reload();
    } catch (e) {
      setNote(e.message);
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) return <p className="text-muted">Loading classes…</p>;
  if (error) return <p className="text-error">{error}</p>;
  if (!data.schedule.length) return <p className="text-muted">No classes scheduled this week.</p>;

  return (
    <div className="space-y-3">
      {note && <p className="rounded-lg bg-elevated px-3 py-2 text-sm text-body">{note}</p>}
      {data.schedule.map((o) => {
        const key = `${o.class_id}|${o.session_date}`;
        return (
          <div key={key} className="card flex items-center justify-between">
            <div>
              <div className="font-display uppercase text-body">{o.name}</div>
              <div className="text-xs text-muted">
                {fmt(o.session_date)} {o.start_time ? `· ${o.start_time.slice(0, 5)}` : ''}
                {o.trainer ? ` · ${o.trainer}` : ''}
              </div>
              <div className="text-xs text-muted">
                {o.available} of {o.max_capacity} open
              </div>
            </div>
            {o.already_booked ? (
              <button className="btn-outline px-3 py-2 text-xs" disabled={busyKey === key} onClick={() => cancel(o)}>
                {busyKey === key ? '…' : 'Cancel'}
              </button>
            ) : !o.allowed ? (
              <span className="text-xs text-muted">Tier locked</span>
            ) : (
              <button className="btn-outline px-4 py-2 text-sm" disabled={busyKey === key} onClick={() => book(o)}>
                {busyKey === key ? '…' : o.is_full ? 'Waitlist' : 'Book'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- history
function HistoryTab() {
  const { data, loading, error } = useEndpoint('/member/history');
  if (loading) return <p className="text-muted">Loading…</p>;
  if (error) return <p className="text-error">{error}</p>;
  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 font-display text-sm uppercase tracking-wider text-accent">Recent Check-ins</h3>
        {data.checkins.length ? (
          data.checkins.map((c, i) => (
            <div key={i} className="flex justify-between border-b border-white/5 py-2 text-sm">
              <span className="text-body">{fmt(c.checked_in_at)}</span>
              <span className="text-muted">{new Date(c.checked_in_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted">No check-ins yet.</p>
        )}
      </div>
      <div>
        <h3 className="mb-2 font-display text-sm uppercase tracking-wider text-accent">Class Bookings</h3>
        {data.bookings.length ? (
          data.bookings.map((b, i) => (
            <div key={i} className="flex justify-between border-b border-white/5 py-2 text-sm">
              <span className="text-body">{b.class_name}</span>
              <span className="text-muted">
                {fmt(b.session_date)} · {b.status}
              </span>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted">No bookings yet.</p>
        )}
      </div>
    </div>
  );
}
