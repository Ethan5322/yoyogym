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

      <nav className="grid grid-cols-6 border-b border-white/5 bg-surface text-xs">
        {[
          ['status', 'Status'],
          ['checkin', 'Check In'],
          ['classes', 'Classes'],
          ['progress', 'Progress'],
          ['history', 'History'],
          ['contact', 'Contact'],
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
        {tab === 'progress' && <ProgressTab />}
        {tab === 'history' && <HistoryTab />}
        {tab === 'contact' && <ContactTab />}
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
        body: {
          image: result.image,                                   // ArcFace (preferred)
          descriptor: result.descriptor ? Array.from(result.descriptor) : undefined, // face-api fallback
        },
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

// ---------------------------------------------------------------- progress
const PROGRESS_FIELDS = [
  ['weight_kg', 'Weight (kg)'],
  ['body_fat_pct', 'Body fat (%)'],
  ['chest_cm', 'Chest (cm)'],
  ['waist_cm', 'Waist (cm)'],
  ['hips_cm', 'Hips (cm)'],
  ['arms_cm', 'Arms (cm)'],
  ['thighs_cm', 'Thighs (cm)'],
];

function ProgressTab() {
  const [entries, setEntries] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  function load() {
    memberFetch('/member/progress').then((d) => setEntries(d.entries || [])).catch((e) => setErr(e.message));
  }
  useEffect(load, []);

  async function save() {
    setBusy(true); setErr('');
    try {
      await memberFetch('/member/progress', { method: 'POST', body: form });
      setForm({});
      load();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  async function del(id) {
    if (!confirm('Delete this entry?')) return;
    try { await memberFetch(`/member/progress?id=${id}`, { method: 'DELETE' }); load(); } catch (e) { setErr(e.message); }
  }

  // weight trend: latest vs first
  const withWeight = (entries || []).filter((e) => e.weight_kg != null);
  const latest = withWeight[0];
  const first = withWeight[withWeight.length - 1];
  const delta = latest && first && withWeight.length > 1 ? Number(latest.weight_kg) - Number(first.weight_kg) : null;

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="font-display text-lg uppercase text-body">My Progress</h2>
        <p className="mt-1 text-sm text-muted">Log your weight &amp; measurements to track your journey.</p>
      </div>

      {latest && (
        <div className="card flex items-center justify-between">
          <div>
            <div className="text-sm text-muted">Latest weight</div>
            <div className="font-display text-3xl text-body">{latest.weight_kg} kg</div>
          </div>
          {delta != null && (
            <div className={`text-right text-sm font-medium ${delta < 0 ? 'text-success' : delta > 0 ? 'text-error' : 'text-muted'}`}>
              {delta > 0 ? '▲' : delta < 0 ? '▼' : '→'} {Math.abs(delta).toFixed(1)} kg
              <div className="text-xs text-muted">since you started</div>
            </div>
          )}
        </div>
      )}

      <div className="card space-y-2">
        <h3 className="font-display uppercase text-body">Add an entry</h3>
        <div className="grid grid-cols-2 gap-2">
          {PROGRESS_FIELDS.map(([k, label]) => (
            <input key={k} className="field" type="number" inputMode="decimal" placeholder={label} value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
          ))}
        </div>
        <textarea className="field min-h-[60px]" placeholder="Note (optional)" value={form.note ?? ''} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        {err && <p className="rounded-lg bg-error/10 px-3 py-2 text-sm text-error">{err}</p>}
        <button className="btn-primary w-full" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save entry'}</button>
      </div>

      <div className="space-y-2">
        {(entries || []).map((e) => (
          <div key={e.id} className="card">
            <div className="flex items-center justify-between">
              <span className="font-display text-body">{fmt(e.recorded_on)}</span>
              <button className="text-xs text-muted hover:text-error" onClick={() => del(e.id)}>Delete</button>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
              {PROGRESS_FIELDS.filter(([k]) => e[k] != null).map(([k, label]) => (
                <span key={k}><span className="text-body">{e[k]}</span> {label.replace(/ \(.*\)/, '').toLowerCase()}</span>
              ))}
            </div>
            {e.note && <p className="mt-1 text-sm text-muted">{e.note}</p>}
          </div>
        ))}
        {entries && !entries.length && <p className="text-center text-sm text-muted">No entries yet — add your first above.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- contact
function ContactTab() {
  const [thread, setThread] = useState([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  function load() {
    memberFetch('/member/messages').then((d) => setThread(d.messages || [])).catch(() => {});
  }
  useEffect(load, []);

  async function send() {
    setBusy(true); setErr('');
    try {
      await memberFetch('/member/message', { method: 'POST', body: { subject, body } });
      setSubject(''); setBody('');
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="font-display text-lg uppercase text-body">Message Management</h2>
        <p className="mt-1 text-sm text-muted">Questions, requests or feedback — and replies from the team.</p>
      </div>

      {thread.length > 0 && (
        <div className="space-y-2">
          {thread.map((m) => (
            <div key={m.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.from === 'management' ? 'bg-accent-soft text-accent' : 'ml-auto bg-surface text-body'}`}>
              <div className="mb-0.5 text-[10px] uppercase tracking-wide opacity-70">{m.from === 'management' ? 'Management' : 'You'}</div>
              <p className="whitespace-pre-wrap">{m.body}</p>
              <div className="mt-1 text-[10px] opacity-60">{new Date(m.at).toLocaleString('en-ZA')}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card space-y-3">
        {!thread.length && <input className="field" placeholder="Subject (optional)" value={subject} onChange={(e) => setSubject(e.target.value)} />}
        <textarea className="field min-h-[110px]" placeholder="Write your message…" value={body} onChange={(e) => setBody(e.target.value)} />
        {err && <p className="rounded-lg bg-error/10 px-3 py-2 text-sm text-error">{err}</p>}
        <button className="btn-primary w-full" onClick={send} disabled={busy || !body.trim()}>
          {busy ? 'Sending…' : thread.length ? 'Send' : 'Send to Management'}
        </button>
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
  const firstName = (data.member?.full_name || '').split(' ')[0];
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-gradient-to-br from-accent/20 to-transparent p-5">
        <div className="text-sm text-muted">Welcome back</div>
        <div className="font-display text-2xl uppercase text-body">{firstName || 'Member'}</div>
        <div className={`mt-1 text-xs uppercase tracking-wide ${badge}`}>● {data.member?.status}</div>
      </div>

      <Announcements />

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

      <PlanChangeRequest currentPlan={m?.plan_name} />

      <FaceEnrol />

      <ReferFriend />

      <ProfileEditor />

      <DeletionRequest />
    </div>
  );
}

function Announcements() {
  const [list, setList] = useState([]);
  useEffect(() => {
    memberFetch('/member/announcements').then((d) => setList(d.announcements || [])).catch(() => {});
  }, []);
  if (!list.length) return null;
  return (
    <div className="card">
      <h3 className="mb-2 font-display text-sm uppercase tracking-wider text-accent">📣 Gym News</h3>
      <div className="space-y-3">
        {list.slice(0, 5).map((a) => (
          <div key={a.id} className="border-b border-white/5 pb-2 last:border-0 last:pb-0">
            <div className="font-display uppercase text-body">{a.title}</div>
            {a.body && <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted">{a.body}</p>}
            <div className="mt-1 text-[10px] uppercase tracking-wide text-muted">{new Date(a.created_at).toLocaleDateString('en-ZA')}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FaceEnrol() {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function onCapture(result) {
    setOpen(false);
    if (!result?.descriptor) return;
    setErr(''); setMsg('');
    try {
      const r = await memberFetch('/member/enroll-face', {
        method: 'POST',
        body: { descriptor: Array.from(result.descriptor), image: result.image },
      });
      setMsg(r.message || 'Face scan updated.');
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display uppercase text-body">Face sign-in 🛡️</p>
          <p className="text-xs text-muted">Update your face scan for fast, secure sign-in &amp; gym access.</p>
        </div>
        {!open && <button className="btn-outline px-3 py-1.5 text-sm" onClick={() => { setMsg(''); setErr(''); setOpen(true); }}>Update scan</button>}
      </div>
      {msg && <p className="mt-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{msg}</p>}
      {err && <p className="mt-2 rounded-lg bg-error/10 px-3 py-2 text-sm text-error">{err}</p>}
      {open && (
        <div className="mt-3">
          <FaceCapture onSubmit={onCapture} />
        </div>
      )}
    </div>
  );
}

function ReferFriend() {
  const [open, setOpen] = useState(false);
  const [refs, setRefs] = useState([]);
  const [form, setForm] = useState({ friend_name: '', friend_phone: '', friend_email: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    memberFetch('/member/refer').then((d) => setRefs(d.referrals || [])).catch(() => {});
  }
  useEffect(() => { if (open) load(); }, [open]);

  async function submit() {
    setBusy(true); setErr(''); setMsg('');
    try {
      const r = await memberFetch('/member/refer', { method: 'POST', body: form });
      setMsg(r.message || 'Thanks!');
      setForm({ friend_name: '', friend_phone: '', friend_email: '' });
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display uppercase text-body">Refer a friend 🎁</p>
          <p className="text-xs text-muted">Train better together — invite a friend to join.</p>
        </div>
        {!open && <button className="btn-outline px-3 py-1.5 text-sm" onClick={() => setOpen(true)}>Invite</button>}
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          <input className="field" placeholder="Friend's name" value={form.friend_name} onChange={(e) => setForm({ ...form, friend_name: e.target.value })} />
          <input className="field" placeholder="Their phone" value={form.friend_phone} onChange={(e) => setForm({ ...form, friend_phone: e.target.value })} />
          <input className="field" placeholder="Their email" value={form.friend_email} onChange={(e) => setForm({ ...form, friend_email: e.target.value })} />
          {msg && <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{msg}</p>}
          {err && <p className="rounded-lg bg-error/10 px-3 py-2 text-sm text-error">{err}</p>}
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={submit} disabled={busy || !form.friend_name.trim()}>{busy ? 'Sending…' : 'Send invite'}</button>
            <button className="btn-outline" onClick={() => setOpen(false)}>Close</button>
          </div>
          {refs.length > 0 && (
            <div className="pt-2">
              <div className="mb-1 text-xs uppercase tracking-wide text-muted">Your referrals</div>
              {refs.map((r, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-body">{r.friend_name}</span>
                  <span className="text-muted">{r.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProfileEditor() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || form) return;
    memberFetch('/member/profile').then((d) => setForm(d.profile || {})).catch(() => setForm({}));
  }, [open, form]);

  const F = [
    ['phone', 'Phone'], ['email', 'Email'],
    ['address_street', 'Street'], ['address_suburb', 'Suburb'], ['address_city', 'City'], ['address_postal_code', 'Postal code'],
    ['emergency_name', 'Emergency contact'], ['emergency_phone', 'Emergency phone'],
    ['medical_aid_provider', 'Medical aid'],
  ];

  async function save() {
    setBusy(true); setErr(''); setMsg('');
    try {
      const r = await memberFetch('/member/profile', { method: 'PATCH', body: form });
      setMsg(r.message || 'Saved.');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display uppercase text-body">My details</p>
          <p className="text-xs text-muted">Keep your contact &amp; emergency info up to date.</p>
        </div>
        {!open && <button className="btn-outline px-3 py-1.5 text-sm" onClick={() => setOpen(true)}>Edit</button>}
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          {!form ? <p className="text-sm text-muted">Loading…</p> : F.map(([k, label]) => (
            <input key={k} className="field" placeholder={label} value={form[k] || ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
          ))}
          {msg && <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{msg}</p>}
          {err && <p className="rounded-lg bg-error/10 px-3 py-2 text-sm text-error">{err}</p>}
          {form && (
            <div className="flex gap-2">
              <button className="btn-primary flex-1" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
              <button className="btn-outline" onClick={() => setOpen(false)}>Close</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PlanChangeRequest({ currentPlan }) {
  const [open, setOpen] = useState(false);
  const [plans, setPlans] = useState([]);
  const [planId, setPlanId] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || plans.length) return;
    memberFetch('/catalog', { auth: false })
      .then((c) => setPlans(c.plans || []))
      .catch(() => {});
  }, [open, plans.length]);

  async function submit() {
    setBusy(true); setErr(''); setMsg('');
    try {
      const r = await memberFetch('/member/request-plan-change', { method: 'POST', body: { plan_id: planId, note } });
      setMsg(r.message || 'Request sent.');
      setNote(''); setPlanId('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display uppercase text-body">Change my plan</p>
          <p className="text-xs text-muted">Currently on {currentPlan || 'your plan'}. Request a change — management will confirm.</p>
        </div>
        {!open && <button className="btn-outline px-3 py-1.5 text-sm" onClick={() => setOpen(true)}>Request</button>}
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          <select className="field" value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">Choose a plan…</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <textarea className="field min-h-[70px]" placeholder="Anything we should know? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          {msg && <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{msg}</p>}
          {err && <p className="rounded-lg bg-error/10 px-3 py-2 text-sm text-error">{err}</p>}
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={submit} disabled={busy || !planId}>{busy ? 'Sending…' : 'Send request'}</button>
            <button className="btn-outline" onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
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
      {data.sessions?.length > 0 && (
        <div>
          <h3 className="mb-2 font-display text-sm uppercase tracking-wider text-accent">Trainer Notes</h3>
          {data.sessions.map((s, i) => (
            <div key={i} className="border-b border-white/5 py-2 text-sm">
              <div className="flex justify-between">
                <span className="text-body">{s.trainer}</span>
                <span className="text-muted">{fmt(s.at)}</span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-muted">{s.notes}</p>
            </div>
          ))}
        </div>
      )}

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
