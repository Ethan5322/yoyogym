// Visitor / guest day-pass management (Phase 99 §E1).
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';

const time = (d) => (d ? new Date(d).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : null);

export default function Visitors() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ name: '', phone: '', host_name: '' });
  const [pass, setPass] = useState(null);
  const [error, setError] = useState('');
  const qrRef = useRef(null);

  function load() {
    apiFetch('/admin/visitor').then((d) => setList(d.visitors)).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  useEffect(() => {
    if (pass && qrRef.current) QRCode.toCanvas(qrRef.current, pass.pass_code, { width: 180, margin: 1 });
  }, [pass]);

  async function issue() {
    setError('');
    if (!form.name.trim()) return setError('Visitor name is required.');
    try {
      const r = await apiFetch('/admin/visitor', { method: 'POST', body: form });
      setPass(r.visitor);
      setForm({ name: '', phone: '', host_name: '' });
      load();
    } catch (e) {
      setError(e.message);
    }
  }
  async function checkin(id) {
    await apiFetch(`/admin/visitor?id=${id}`, { method: 'PATCH' });
    load();
  }

  return (
    <AdminShell>
      <h1 className="text-2xl font-bold uppercase text-body">Visitors</h1>
      <p className="mt-1 text-muted">Issue a temporary day pass for a guest.</p>
      {error && <p className="mt-3 text-error">{error}</p>}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3">
          <h2 className="font-display uppercase text-body">Issue Day Pass</h2>
          <input className="field" placeholder="Visitor full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="field" placeholder="Phone (optional)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className="field" placeholder="Host member name (optional)" value={form.host_name} onChange={(e) => setForm({ ...form, host_name: e.target.value })} />
          <button className="btn-primary w-full" onClick={issue}>Issue Pass</button>
        </div>

        {pass && (
          <div className="card animate-slide-up text-center">
            <h2 className="font-display uppercase text-success">Day Pass Issued</h2>
            <p className="mt-1 text-body">{pass.name}</p>
            <div className="mt-3 inline-block rounded-xl bg-white p-3"><canvas ref={qrRef} /></div>
            <div className="mt-2 font-mono text-2xl tracking-[0.3em] text-accent">{pass.pass_code}</div>
            <p className="mt-1 text-xs text-muted">Valid today only · show this code at reception</p>
          </div>
        )}
      </div>

      <h2 className="mt-8 font-display uppercase text-body">Today’s Visitors ({list.length})</h2>
      <div className="mt-2 space-y-2">
        {list.map((v) => (
          <div key={v.id} className="card flex items-center justify-between">
            <div>
              <div className="text-body">{v.name} <span className="font-mono text-xs text-accent">{v.pass_code}</span></div>
              <div className="text-xs text-muted">{[v.phone, v.host_name ? `host: ${v.host_name}` : null].filter(Boolean).join(' · ')}</div>
            </div>
            {v.checked_in_at ? (
              <span className="text-sm text-success">In {time(v.checked_in_at)}</span>
            ) : (
              <button className="btn-outline px-3 py-1 text-sm" onClick={() => checkin(v.id)}>Check in</button>
            )}
          </div>
        ))}
        {!list.length && <p className="text-muted">No visitors today.</p>}
      </div>
    </AdminShell>
  );
}
