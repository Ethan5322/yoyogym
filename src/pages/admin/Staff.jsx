// Staff & roles management (spec 4.1). Owner only. Create logins for managers,
// reception and trainers; change roles, enable/disable, reset passwords.
import { useEffect, useState } from 'react';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';

const ROLES = ['owner', 'manager', 'reception', 'trainer'];
const empty = { username: '', full_name: '', email: '', role: 'reception', password: '', trainer_id: '' };

export default function Staff() {
  const [staff, setStaff] = useState(null);
  const [trainers, setTrainers] = useState([]);
  const [form, setForm] = useState(empty);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  function load() {
    apiFetch('/admin/staff').then((d) => setStaff(d.staff || [])).catch((e) => setErr(e.message));
    apiFetch('/admin/trainers').then((d) => setTrainers(d.trainers || [])).catch(() => {});
  }
  useEffect(load, []);

  async function create() {
    setMsg(''); setErr('');
    try {
      await apiFetch('/admin/staff', { method: 'POST', body: { ...form, trainer_id: form.trainer_id || null } });
      setMsg('Staff account created.');
      setForm(empty);
      load();
    } catch (e) { setErr(e.message); }
  }
  async function patch(id, body, label) {
    setMsg(''); setErr('');
    try {
      await apiFetch(`/admin/staff?id=${id}`, { method: 'PATCH', body });
      setMsg(label || 'Updated.');
      load();
    } catch (e) { setErr(e.message); }
  }
  async function remove(id, name) {
    if (!confirm(`Delete the login for ${name}? This cannot be undone.`)) return;
    setMsg(''); setErr('');
    try { await apiFetch(`/admin/staff?id=${id}`, { method: 'DELETE' }); setMsg('Account deleted.'); load(); }
    catch (e) { setErr(e.message); }
  }
  async function resetPw(id, name) {
    const pw = prompt(`New password for ${name} (min 8 characters):`);
    if (!pw) return;
    patch(id, { password: pw }, 'Password reset.');
  }

  return (
    <AdminShell>
      <h1 className="text-2xl font-bold uppercase text-body">Staff & Roles</h1>
      <p className="mt-1 text-muted">Create and manage logins for your team. Each person should have their own account.</p>
      {msg && <p className="mt-3 text-sm text-success">{msg}</p>}
      {err && <p className="mt-3 text-sm text-error">{err}</p>}

      {/* Create */}
      <div className="card mt-5">
        <h2 className="mb-3 font-display uppercase text-body">Add a staff login</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <input className="field" placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <input className="field" placeholder="Full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <input className="field" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <select className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {form.role === 'trainer' && (
            <select className="field" value={form.trainer_id} onChange={(e) => setForm({ ...form, trainer_id: e.target.value })}>
              <option value="">Link to trainer profile…</option>
              {trainers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          )}
          <input className="field" type="password" placeholder="Temporary password (min 8)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <button className="btn-primary mt-3 px-4 py-2 text-sm" onClick={create} disabled={!form.username || !form.password}>Create account</button>
      </div>

      {/* List */}
      <div className="mt-6 overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-muted">
            <tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Username</th><th className="px-4 py-2">Role</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Actions</th></tr>
          </thead>
          <tbody>
            {(staff || []).map((s) => (
              <tr key={s.id} className="border-t border-white/5">
                <td className="px-4 py-2 text-body">{s.full_name || '—'}</td>
                <td className="px-4 py-2 text-muted">{s.username}</td>
                <td className="px-4 py-2">
                  <select className="field py-1" value={s.role} onChange={(e) => patch(s.id, { role: e.target.value }, 'Role updated.')}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <span className={s.is_active ? 'text-success' : 'text-muted'}>{s.is_active ? 'Active' : 'Disabled'}</span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-outline px-2 py-1 text-xs" onClick={() => patch(s.id, { is_active: !s.is_active }, 'Updated.')}>{s.is_active ? 'Disable' : 'Enable'}</button>
                    <button className="btn-outline px-2 py-1 text-xs" onClick={() => resetPw(s.id, s.username)}>Reset password</button>
                    <button className="btn-outline px-2 py-1 text-xs" onClick={() => remove(s.id, s.username)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {staff && !staff.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted">No staff yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
