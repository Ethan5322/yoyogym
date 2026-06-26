// Staff & roles management (spec 4.1). Owner only. Register staff with a face
// scan + photo; each gets a staff number, verification code and a downloadable
// corporate ID card + PDF. Also change roles, enable/disable, reset passwords.
import { useEffect, useState } from 'react';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';
import FaceCapture from '../../chatbot/components/FaceCapture.jsx';
import CredentialActions from '../../components/CredentialActions.jsx';

const ROLES = ['owner', 'manager', 'reception', 'trainer'];
const empty = { username: '', full_name: '', email: '', role: 'reception', job_title: '', phone: '', password: '', trainer_id: '', photo_url: '', face_descriptor: null };

export default function Staff() {
  const [staff, setStaff] = useState(null);
  const [trainers, setTrainers] = useState([]);
  const [form, setForm] = useState(empty);
  const [faceOpen, setFaceOpen] = useState(false);
  const [created, setCreated] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  function load() {
    apiFetch('/admin/staff').then((d) => setStaff(d.staff || [])).catch((e) => setErr(e.message));
    apiFetch('/admin/trainers').then((d) => setTrainers(d.trainers || [])).catch(() => {});
  }
  useEffect(load, []);

  async function create() {
    setMsg(''); setErr(''); setCreated(null);
    try {
      const r = await apiFetch('/admin/staff', { method: 'POST', body: { ...form, trainer_id: form.trainer_id || null } });
      setCreated({
        kind: 'staff',
        id: r.id,
        name: form.full_name || form.username,
        number: r.staff_number,
        verification_code: r.verification_code,
        badge: form.job_title || form.role,
        photo_url: form.photo_url,
      });
      setMsg('Staff account created. Download their ID card & PDF below.');
      setForm(empty);
      load();
    } catch (e) { setErr(e.message); }
  }
  async function patch(id, body, label) {
    setMsg(''); setErr('');
    try { await apiFetch(`/admin/staff?id=${id}`, { method: 'PATCH', body }); setMsg(label || 'Updated.'); load(); }
    catch (e) { setErr(e.message); }
  }
  async function remove(id, name) {
    if (!confirm(`Delete the login for ${name}? This cannot be undone.`)) return;
    try { await apiFetch(`/admin/staff?id=${id}`, { method: 'DELETE' }); setMsg('Account deleted.'); load(); }
    catch (e) { setErr(e.message); }
  }
  const resetPw = (id, name) => { const pw = prompt(`New password for ${name} (min 8 characters):`); if (pw) patch(id, { password: pw }, 'Password reset.'); };

  return (
    <AdminShell>
      <h1 className="text-2xl font-bold uppercase text-body">Staff & Roles</h1>
      <p className="mt-1 text-muted">Register your team. Each staff member gets a login, a face scan for access, and a corporate ID card + PDF.</p>
      {msg && <p className="mt-3 text-sm text-success">{msg}</p>}
      {err && <p className="mt-3 text-sm text-error">{err}</p>}

      {/* Just-created credential */}
      {created && (
        <div className="card mt-4 border border-accent/30">
          <h2 className="mb-1 font-display uppercase text-body">{created.name} — credential ready</h2>
          <p className="mb-2 text-xs text-muted">
            Staff No: <span className="text-accent">{created.number || '—'}</span> · Verification: <span className="text-accent">{created.verification_code || '—'}</span>
          </p>
          <CredentialActions person={created} />
        </div>
      )}

      {/* Register form */}
      <div className="card mt-5">
        <h2 className="mb-3 font-display uppercase text-body">Register a staff member</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <input className="field" placeholder="Username (for login)" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <input className="field" placeholder="Full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <input className="field" placeholder="Job title (e.g. Receptionist)" value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} />
          <input className="field" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
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

        <div className="mt-4 flex flex-wrap items-center gap-4">
          {form.photo_url ? (
            <img src={form.photo_url} alt="" className="h-20 w-[60px] rounded object-cover gold-frame" />
          ) : (
            <div className="flex h-20 w-[60px] items-center justify-center rounded bg-elevated text-xs text-muted">No photo</div>
          )}
          <button className="btn-outline px-4 py-2 text-sm" onClick={() => setFaceOpen(true)}>
            {form.face_descriptor ? '✓ Retake face & photo' : '📷 Capture face & photo'}
          </button>
          <button className="btn-primary px-5 py-2 text-sm" onClick={create} disabled={!form.username || !form.password}>Register staff</button>
        </div>
        <p className="mt-2 text-xs text-muted">Face scan enables fast, secure gym access and puts their photo on the ID. Stored privately (POPIA).</p>
      </div>

      {/* List */}
      <div className="mt-6 overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-muted">
            <tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Role</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">ID</th><th className="px-4 py-2">Actions</th></tr>
          </thead>
          <tbody>
            {(staff || []).map((s) => (
              <tr key={s.id} className="border-t border-white/5 align-top">
                <td className="px-4 py-2">
                  <div className="text-body">{s.full_name || '—'}</div>
                  <div className="text-xs text-muted">{s.username}{s.job_title ? ` · ${s.job_title}` : ''}</div>
                </td>
                <td className="px-4 py-2">
                  <select className="field py-1" value={s.role} onChange={(e) => patch(s.id, { role: e.target.value }, 'Role updated.')}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2"><span className={s.is_active ? 'text-success' : 'text-muted'}>{s.is_active ? 'Active' : 'Disabled'}</span></td>
                <td className="px-4 py-2">
                  <CredentialActions person={{ kind: 'staff', id: s.id, name: s.full_name || s.username, number: s.staff_number, verification_code: s.verification_code, badge: s.job_title || s.role, photo_url: s.photo_url }} />
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-outline px-2 py-1 text-xs" onClick={() => patch(s.id, { is_active: !s.is_active }, 'Updated.')}>{s.is_active ? 'Disable' : 'Enable'}</button>
                    <button className="btn-outline px-2 py-1 text-xs" onClick={() => resetPw(s.id, s.username)}>Reset pw</button>
                    <button className="btn-outline px-2 py-1 text-xs" onClick={() => remove(s.id, s.username)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {staff && !staff.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted">No staff yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Face capture modal */}
      {faceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setFaceOpen(false)}>
          <div className="card w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 font-display uppercase text-body">Capture staff face & photo</h2>
            <FaceCapture onSubmit={(res) => { if (res?.descriptor) setForm((f) => ({ ...f, face_descriptor: res.descriptor, photo_url: res.image })); setFaceOpen(false); }} />
          </div>
        </div>
      )}
    </AdminShell>
  );
}
