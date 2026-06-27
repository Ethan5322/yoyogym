// Bulk communications (spec 4.12): email a filtered member group via Brevo,
// starting from a template, and review a full send-history (notifications_log).
import { useEffect, useState } from 'react';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';

// Reusable starting points so staff don't write every blast from scratch.
const TEMPLATES = [
  { key: 'blank', label: 'Blank', subject: '', message: '' },
  {
    key: 'reengage',
    label: 'Win-back (lapsed)',
    subject: 'We miss you at the gym 💪',
    message: 'Hi there,\n\nWe noticed it has been a while since your last visit. Come back this week and pick up right where you left off — your goals are waiting!\n\nSee you soon,\nThe team',
  },
  {
    key: 'renewal',
    label: 'Renewal reminder',
    subject: 'Your membership is expiring soon',
    message: 'Hi there,\n\nJust a reminder that your membership is coming to an end. Renew now to keep your access and avoid any interruption.\n\nThank you,\nThe team',
  },
  {
    key: 'promo',
    label: 'Promotion',
    subject: 'A special offer just for you',
    message: 'Hi there,\n\nFor a limited time we are offering an exclusive deal to our members. Reply or pop in at reception to find out more.\n\nThe team',
  },
];

export default function Communications() {
  const toast = useToast();
  const [tab, setTab] = useState('compose');

  return (
    <AdminShell>
      <h1 className="text-2xl font-bold uppercase text-body">Communications</h1>

      <div className="mt-4 flex gap-2 border-b border-white/5">
        <Tab active={tab === 'compose'} onClick={() => setTab('compose')}>Compose</Tab>
        <Tab active={tab === 'announce'} onClick={() => setTab('announce')}>Announcements</Tab>
        <Tab active={tab === 'history'} onClick={() => setTab('history')}>History</Tab>
      </div>

      {tab === 'compose' && <Compose toast={toast} />}
      {tab === 'announce' && <Announcements toast={toast} />}
      {tab === 'history' && <History />}
    </AdminShell>
  );
}

function Compose({ toast }) {
  const [status, setStatus] = useState('active');
  const [tier, setTier] = useState('');
  const [template, setTemplate] = useState('blank');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  function applyTemplate(key) {
    setTemplate(key);
    const t = TEMPLATES.find((x) => x.key === key);
    if (t) { setSubject(t.subject); setMessage(t.message); }
  }

  async function send() {
    if (!confirm('Send this email to every member matching the filter?')) return;
    setBusy(true);
    try {
      const r = await apiFetch('/admin/broadcast', {
        method: 'POST',
        body: { filter: { status: status || undefined, tier: tier || undefined }, subject, message },
      });
      toast.success(`Sent to ${r.sent} member(s)${r.failed ? `, ${r.failed} failed` : ''}.`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 card space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <select className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>
          {['active', 'lapsed', 'suspended'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="field" value={tier} onChange={(e) => setTier(e.target.value)}>
          <option value="">Any tier</option>
          {['basic', 'standard', 'premium', 'vip'].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <select className="field" value={template} onChange={(e) => applyTemplate(e.target.value)}>
        {TEMPLATES.map((t) => <option key={t.key} value={t.key}>Template: {t.label}</option>)}
      </select>
      <input className="field" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <textarea className="field min-h-[160px]" placeholder="Message…" value={message} onChange={(e) => setMessage(e.target.value)} />
      <button className="btn-primary w-full" disabled={busy || !subject || !message} onClick={send}>
        {busy ? 'Sending…' : 'Send Email Broadcast'}
      </button>
    </div>
  );
}

function Announcements({ toast }) {
  const [list, setList] = useState(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    apiFetch('/admin/announcements').then((d) => setList(d.announcements || [])).catch((e) => toast.error(e.message));
  }
  useEffect(load, []);

  async function create() {
    setBusy(true);
    try {
      await apiFetch('/admin/announcements', { method: 'POST', body: { title, body } });
      toast.success('Announcement published.');
      setTitle(''); setBody('');
      load();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function remove(a) {
    if (!confirm('Delete this announcement?')) return;
    try { await apiFetch(`/admin/announcements?id=${a.id}`, { method: 'DELETE' }); load(); }
    catch (e) { toast.error(e.message); }
  }
  async function toggle(a) {
    try { await apiFetch(`/admin/announcements?id=${a.id}`, { method: 'PATCH', body: { is_published: !a.is_published } }); load(); }
    catch (e) { toast.error(e.message); }
  }

  return (
    <div className="mt-6 space-y-5">
      <div className="card space-y-3">
        <h2 className="font-display uppercase text-body">New announcement</h2>
        <input className="field" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="field min-h-[110px]" placeholder="What's the news? (closures, events, promotions…)" value={body} onChange={(e) => setBody(e.target.value)} />
        <button className="btn-primary w-full" onClick={create} disabled={busy || !title.trim()}>{busy ? 'Publishing…' : 'Publish to members'}</button>
      </div>

      {list && list.map((a) => (
        <div key={a.id} className="card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-display uppercase text-body">{a.title} {!a.is_published && <span className="text-xs text-muted">(hidden)</span>}</div>
              {a.body && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{a.body}</p>}
              <div className="mt-1 text-xs text-muted">{new Date(a.created_at).toLocaleString('en-ZA')} · {a.created_by_name || 'Management'}</div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 text-xs">
              <button className="text-accent hover:underline" onClick={() => toggle(a)}>{a.is_published ? 'Hide' : 'Publish'}</button>
              <button className="text-error hover:underline" onClick={() => remove(a)}>Delete</button>
            </div>
          </div>
        </div>
      ))}
      {list && !list.length && <p className="text-muted">No announcements yet.</p>}
    </div>
  );
}

function History() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    apiFetch('/admin/notifications').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="mt-6 text-error">{error}</p>;
  if (!data) return <p className="mt-6 text-muted">Loading…</p>;
  if (!data.notifications.length) return <p className="mt-6 text-muted">No messages have been sent yet.</p>;

  return (
    <div className="mt-6 overflow-x-auto rounded-xl border border-white/5">
      <table className="w-full text-sm">
        <thead className="bg-surface text-left text-muted">
          <tr>
            <th className="px-3 py-2">When</th>
            <th className="px-3 py-2">Recipient</th>
            <th className="px-3 py-2 hidden sm:table-cell">Type</th>
            <th className="px-3 py-2">Subject</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {data.notifications.map((n) => (
            <tr key={n.id} className="border-t border-white/5">
              <td className="px-3 py-2 text-muted">{n.at ? new Date(n.at).toLocaleString('en-ZA') : '—'}</td>
              <td className="px-3 py-2 text-body">{n.member_name || n.recipient}</td>
              <td className="px-3 py-2 hidden text-muted sm:table-cell">{n.channel} · {n.template_key || '—'}</td>
              <td className="px-3 py-2 text-body">{n.subject || '—'}</td>
              <td className="px-3 py-2">
                <span className={n.status === 'sent' ? 'text-success' : 'text-error'}>{n.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tab({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
        active ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-body'
      }`}
    >
      {children}
    </button>
  );
}
