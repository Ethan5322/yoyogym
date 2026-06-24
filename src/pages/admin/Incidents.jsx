// Security incident log (Phase 99 §E2).
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';

const fmt = (d) => new Date(d).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function Incidents() {
  const [params] = useSearchParams();
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ person_label: params.get('person') || '', note: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  function load() {
    apiFetch('/admin/incident').then((d) => setList(d.incidents)).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function report() {
    setMsg('');
    if (!form.note.trim()) return setError('Describe the incident.');
    setError('');
    try {
      await apiFetch('/admin/incident', { method: 'POST', body: form });
      setMsg('Incident logged — owner notified.');
      setForm({ person_label: '', note: '' });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <AdminShell>
      <h1 className="text-2xl font-bold uppercase text-body">Incidents</h1>
      {error && <p className="mt-3 text-error">{error}</p>}

      <div className="card mt-4 space-y-3">
        <h2 className="font-display uppercase text-body">Report Incident</h2>
        <input className="field" placeholder="Person (name or description)" value={form.person_label} onChange={(e) => setForm({ ...form, person_label: e.target.value })} />
        <textarea className="field min-h-[80px]" placeholder="What happened?" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        {msg && <p className="text-sm text-success">{msg}</p>}
        <button className="btn-primary px-4 py-2 text-sm" onClick={report}>Log Incident &amp; Notify Owner</button>
      </div>

      <h2 className="mt-8 font-display uppercase text-body">Recent Incidents</h2>
      <div className="mt-2 space-y-2">
        {list.map((i) => (
          <div key={i.id} className="card border-l-4 border-error">
            <div className="flex justify-between">
              <span className="font-display text-body">{i.person}{i.membership_number ? ` · ${i.membership_number}` : ''}</span>
              <span className="text-xs text-muted">{fmt(i.created_at)} · {i.by}</span>
            </div>
            <p className="mt-1 text-sm text-muted">{i.note}</p>
          </div>
        ))}
        {!list.length && <p className="text-muted">No incidents logged.</p>}
      </div>
    </AdminShell>
  );
}
