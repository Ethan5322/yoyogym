// Admin inbox — messages from members & staff + member-action alerts.
// Owner/Manager. Staff can also write to management from here.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import { SkeletonRows } from '../../components/ui.jsx';

const fmt = (d) => (d ? new Date(d).toLocaleString('en-ZA') : '—');
const FILTERS = [['', 'All'], ['message', 'Messages'], ['event', 'Alerts']];
const ICON = { 'member.message': '✉', 'staff.message': '✉', 'class.booked': '◈', 'class.cancelled': '⊘', 'plan.change_request': '↔' };

export default function Inbox() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [kind, setKind] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [compose, setCompose] = useState(false);
  const [replyTo, setReplyTo] = useState(null);

  function load() {
    const p = new URLSearchParams();
    if (kind) p.set('kind', kind);
    if (unreadOnly) p.set('unread', '1');
    apiFetch(`/admin/inbox?${p}`).then(setData).catch((e) => setError(e.message));
  }
  useEffect(load, [kind, unreadOnly]);

  async function markRead(item, is_read = true) {
    try {
      await apiFetch(`/admin/inbox?id=${item.id}`, { method: 'PATCH', body: { is_read } });
      load();
    } catch (e) { toast.error(e.message); }
  }
  async function markAll() {
    try {
      await apiFetch('/admin/inbox?all=1', { method: 'PATCH' });
      toast.success('All marked as read.');
      load();
    } catch (e) { toast.error(e.message); }
  }

  return (
    <AdminShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold uppercase text-body">
          Inbox {data?.unread_count > 0 && <span className="ml-2 rounded-full bg-accent px-2 py-0.5 align-middle text-sm text-white">{data.unread_count}</span>}
        </h1>
        <div className="flex gap-2">
          <button className="btn-outline px-3 py-1 text-sm" onClick={markAll} disabled={!data?.unread_count}>Mark all read</button>
          <button className="btn-primary px-3 py-1 text-sm" onClick={() => setCompose(true)}>Message management</button>
        </div>
      </div>
      <p className="mt-1 text-muted">Messages from members &amp; staff, plus member-action alerts.</p>

      <div className="admin-toolbar mt-5">
        {FILTERS.map(([v, l]) => (
          <button key={v} onClick={() => setKind(v)} className={`rounded-full px-4 py-1.5 text-sm ${kind === v ? 'bg-accent text-white' : 'bg-surface text-muted'}`}>{l}</button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} /> Unread only
        </label>
      </div>

      {error && <p className="mt-4 text-error">{error}</p>}
      {!data && !error && <div className="mt-5"><SkeletonRows rows={6} cols={2} /></div>}

      {data && (
        <div className="mt-5 space-y-2">
          {data.items.map((it) => (
            <div key={it.id} className={`card flex items-start gap-3 ${it.is_read ? 'opacity-70' : 'border-accent/30'}`}>
              <span className="mt-0.5 text-lg text-accent" aria-hidden>{ICON[it.type] || (it.kind === 'message' ? '✉' : '•')}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display uppercase text-body">{it.title || (it.kind === 'message' ? 'Message' : 'Alert')}</span>
                  {!it.is_read && <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent">New</span>}
                  <span className="ml-auto text-xs text-muted">{fmt(it.created_at)}</span>
                </div>
                {it.body && <p className="mt-1 whitespace-pre-wrap text-sm text-body">{it.body}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  {it.sender_name && <span className="text-muted">{it.direction === 'out' ? 'To member' : `From: ${it.sender_name}`}</span>}
                  {it.link && <Link to={it.link} className="text-accent hover:underline">Open member →</Link>}
                  {it.kind === 'message' && it.direction !== 'out' && it.member_id && (
                    <button className="text-accent hover:underline" onClick={() => setReplyTo(replyTo === it.id ? null : it.id)}>
                      {replyTo === it.id ? 'Cancel reply' : 'Reply'}
                    </button>
                  )}
                  <button className="text-muted hover:text-body" onClick={() => markRead(it, !it.is_read)}>
                    {it.is_read ? 'Mark unread' : 'Mark read'}
                  </button>
                </div>
                {replyTo === it.id && <ReplyBox item={it} toast={toast} onSent={() => { setReplyTo(null); load(); }} />}
              </div>
            </div>
          ))}
          {!data.items.length && <p className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-muted">Nothing here yet.</p>}
        </div>
      )}

      {compose && <Compose toast={toast} onClose={() => setCompose(false)} />}
    </AdminShell>
  );
}

function ReplyBox({ item, toast, onSent }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    try {
      await apiFetch('/admin/inbox', { method: 'POST', body: { member_id: item.member_id, body, parent_id: item.id } });
      toast.success('Reply sent to member.');
      onSent();
    } catch (e) { toast.error(e.message); setBusy(false); }
  }
  return (
    <div className="mt-3 space-y-2 rounded-lg bg-surface p-3">
      <textarea className="field min-h-[80px]" placeholder="Write a reply — the member sees it in their portal and by email…" value={body} onChange={(e) => setBody(e.target.value)} />
      <button className="btn-primary px-4 py-1.5 text-sm" onClick={send} disabled={busy || !body.trim()}>{busy ? 'Sending…' : 'Send reply'}</button>
    </div>
  );
}

function Compose({ toast, onClose }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    try {
      const r = await apiFetch('/admin/message', { method: 'POST', body: { subject, body } });
      toast.success(r.message || 'Sent.');
      onClose();
    } catch (e) { toast.error(e.message); setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="card w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display uppercase text-body">Message management</h2>
        <input className="field" placeholder="Subject (optional)" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <textarea className="field min-h-[140px]" placeholder="Write your message to management…" value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="flex gap-3">
          <button className="btn-primary flex-1" onClick={send} disabled={busy || !body.trim()}>{busy ? 'Sending…' : 'Send'}</button>
          <button className="btn-outline" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
