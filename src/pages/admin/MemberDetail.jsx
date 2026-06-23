// Member profile + quick actions (spec 4.4). Owner/Manager.
import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';

const zar = (n) => 'R' + Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 });
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export default function MemberDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  async function deleteMember() {
    if (!confirm('Permanently delete this member and ALL their data? This cannot be undone (POPIA erasure).')) return;
    try {
      await apiFetch(`/admin/member?id=${id}`, { method: 'DELETE' });
      navigate('/admin/members', { replace: true });
    } catch (e) {
      setError(e.message);
    }
  }

  function load() {
    apiFetch(`/admin/member?id=${id}`)
      .then((d) => {
        setData(d);
        setNotes(d.member.staff_notes || '');
      })
      .catch((e) => setError(e.message));
  }
  useEffect(load, [id]);

  async function patch(body) {
    setSavedMsg('');
    try {
      await apiFetch(`/admin/member?id=${id}`, { method: 'PATCH', body });
      setSavedMsg('Saved.');
      load();
    } catch (e) {
      setSavedMsg(e.message);
    }
  }

  async function action(name) {
    setSavedMsg('');
    try {
      const r = await apiFetch(`/admin/member-action?id=${id}`, { method: 'POST', body: { action: name } });
      setSavedMsg(r.message || 'Done.');
      load();
    } catch (e) {
      setSavedMsg(e.message);
    }
  }

  if (error) return <AdminShell><p className="text-error">{error}</p></AdminShell>;
  if (!data) return <AdminShell><p className="text-muted">Loading…</p></AdminShell>;

  const m = data.member;
  const current = data.memberships[0];

  return (
    <AdminShell>
      <Link to="/admin/members" className="text-sm text-muted hover:text-body">← Members</Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold uppercase text-body">{m.full_name}</h1>
          <p className="text-muted">{m.membership_number} · <span className="text-accent">{m.status}</span></p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary px-3 py-2 text-sm" onClick={() => action('checkin')}>Check in</button>
          <button className="btn-outline px-3 py-2 text-sm" onClick={() => action('renew')}>Renew</button>
          <button className="btn-outline px-3 py-2 text-sm" onClick={() => action('regenerate_code')}>New code</button>
          {m.phone && (
            <a className="btn-outline px-3 py-2 text-sm" href={`https://wa.me/${m.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer">WhatsApp</a>
          )}
          {m.email && (
            <a className="btn-outline px-3 py-2 text-sm" href={`mailto:${m.email}`}>Email</a>
          )}
          {m.status === 'suspended' ? (
            <button className="btn-primary px-3 py-2 text-sm" onClick={() => patch({ status: 'active' })}>Reactivate</button>
          ) : (
            <button className="btn-outline px-3 py-2 text-sm" onClick={() => patch({ status: 'suspended' })}>Suspend</button>
          )}
        </div>
      </div>
      {savedMsg && <p className="mt-2 text-sm text-success">{savedMsg}</p>}

      {m.parq_flag && (
        <p className="mt-4 rounded-lg bg-error/10 px-3 py-2 text-sm text-error">
          ⚠ Medical clearance required (PAR-Q).
        </p>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Section title="Personal">
          <Row label="Phone" value={m.phone} />
          <Row label="Email" value={m.email} />
          <Row label="Date of Birth" value={fmt(m.date_of_birth)} />
          <Row label="ID / Passport" value={m.id_number || m.passport_number || '—'} />
          <Row label="Address" value={[m.address_street, m.address_suburb, m.address_city, m.address_postal_code].filter(Boolean).join(', ') || '—'} />
          <Row label="Emergency" value={`${m.emergency_name || '—'} ${m.emergency_phone || ''}`} />
          <Row label="Medical Aid" value={m.medical_aid_provider || '—'} />
        </Section>

        <Section title="Membership">
          <Row label="Plan" value={current?.plans?.name || current?.visit_type || '—'} />
          <Row label="State" value={current?.state || '—'} />
          <Row label="Start" value={fmt(current?.start_date)} />
          <Row label="End" value={current?.end_date ? fmt(current.end_date) : 'Ongoing'} />
          {current?.sessions_total ? <Row label="Sessions" value={`${current.sessions_remaining}/${current.sessions_total}`} /> : null}
          <Row label="Next billing" value={fmt(current?.next_billing_date)} />
        </Section>

        <Section title="Payments">
          {data.payments.length ? data.payments.slice(0, 8).map((p) => (
            <Row key={p.id} label={`${fmt(p.created_at)} · ${p.category}`} value={`${zar(p.amount)} (${p.status})`} />
          )) : <p className="text-sm text-muted">No payments.</p>}
        </Section>

        <Section title="Attendance">
          {data.checkins.length ? data.checkins.slice(0, 8).map((c, i) => (
            <Row key={i} label={fmt(c.checked_in_at)} value={c.method} />
          )) : <p className="text-sm text-muted">No check-ins.</p>}
        </Section>

        <Section title="Fitness & PAR-Q">
          <Row label="Goals" value={(m.fitness_goals || []).join(', ') || '—'} />
          <Row label="Experience" value={m.experience_level || '—'} />
          <Row label="Clearance required" value={data.parq?.clearance_required ? 'Yes' : 'No'} />
        </Section>

        <Section title="Add-ons">
          {data.addons.length ? data.addons.map((a) => (
            <Row key={a.id} label={a.addon_services?.name || 'Add-on'} value={zar(a.price_at_purchase)} />
          )) : <p className="text-sm text-muted">None.</p>}
        </Section>
      </div>

      <Section title="Staff Notes">
        <textarea className="field min-h-[80px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="mt-2 flex items-center gap-3">
          <button className="btn-primary px-4 py-2 text-sm" onClick={() => patch({ staff_notes: notes })}>
            Save notes
          </button>
          {savedMsg && <span className="text-sm text-muted">{savedMsg}</span>}
        </div>
      </Section>

      {m.data_deletion_requested && (
        <p className="mt-4 rounded-lg bg-error/10 px-3 py-2 text-sm text-error">
          ⚠ This member has requested data deletion (POPIA).
        </p>
      )}
      {user?.role === 'owner' && (
        <div className="mt-4">
          <button className="text-sm text-error underline" onClick={deleteMember}>
            Delete member &amp; erase all data (POPIA)
          </button>
        </div>
      )}
    </AdminShell>
  );
}

function Section({ title, children }) {
  return (
    <div className="card">
      <h2 className="mb-3 font-display text-sm uppercase tracking-wider text-accent">{title}</h2>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-right text-body">{value}</span>
    </div>
  );
}
