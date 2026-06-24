// Settings & configuration (spec 4.13). OWNER ONLY. Edits gym profile,
// notification contacts, contract discounts, and legal text — all stored as
// rows in the settings table and consumed across the app.
import { useEffect, useState } from 'react';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';
import FaceCapture from '../../chatbot/components/FaceCapture.jsx';

export default function Settings() {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  const [savedKey, setSavedKey] = useState('');

  function load() {
    apiFetch('/admin/settings').then((d) => setS(d.settings || {})).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function save(key, value, category) {
    setSavedKey('');
    try {
      await apiFetch('/admin/settings', { method: 'PUT', body: { key, value, category } });
      setSavedKey(key);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (error) return <AdminShell><p className="text-error">{error}</p></AdminShell>;
  if (!s) return <AdminShell><p className="text-muted">Loading…</p></AdminShell>;

  return (
    <AdminShell>
      <h1 className="text-2xl font-bold uppercase text-body">Settings</h1>
      <p className="mt-1 text-muted">
        Configure your gym below. Everything is pre-filled with professional defaults — review each section,
        edit anything you like, and click <b>Save</b> on that section. Changes apply across the member app, emails, and PDFs.
      </p>

      <Section title="Gym Profile" saved={savedKey === 'gym_profile'}
        note="Your brand identity. The name and accent colour appear on the splash screen, membership card, emails and PDFs."
        initial={{ ...DEFAULTS.gym_profile, ...(s.gym_profile || {}) }}
        fields={[['name', 'Gym name'], ['tagline', 'Tagline (shown on the splash screen)'], ['accent_color', 'Brand accent colour (hex, e.g. #E63946)'], ['phone', 'Contact phone'], ['email', 'Contact email'], ['website', 'Website (optional)'], ['address', 'Physical address'], ['operating_hours', 'Operating hours'], ['welcome_message', 'Welcome message (splash screen)']]}
        onSave={(v) => save('gym_profile', v, 'gym_profile')} />

      <Section title="Owner Notifications" saved={savedKey === 'notifications'}
        initial={s.notifications || {}}
        fields={[['owner_email', 'Owner email'], ['owner_whatsapp_phone', 'WhatsApp phone (+27…)'], ['owner_whatsapp_apikey', 'CallMeBot WhatsApp API key'], ['owner_telegram_user', 'Telegram username (@…)']]}
        note="Where instant alerts (new members, payments, capacity, incidents) are sent. CallMeBot needs a one-time activation per number/username — WhatsApp: message the CallMeBot number to get your API key; Telegram: start the CallMeBot and send /start."
        onSave={(v) => save('notifications', v, 'notifications')} />

      <Section title="Contract Discounts (%)" saved={savedKey === 'contract_discounts'}
        note="Percentage discount applied to the monthly fee for longer commitments. Longer contracts reward loyalty and reduce churn."
        initial={s.contract_discounts || { month_to_month: 0, '3_month': 0, '6_month': 5, '12_month': 10 }}
        fields={[['month_to_month', 'Month-to-month'], ['3_month', '3 month'], ['6_month', '6 month'], ['12_month', '12 month']]}
        numeric
        onSave={(v) => save('contract_discounts', v, 'payment')} />

      <ComplianceSection initial={s.compliance} saved={savedKey === 'compliance'} onSave={(v) => save('compliance', v, 'access')} />

      <AdminFaceEnroll />

      <TextSection title="Gym Rules & Code of Conduct" k="gym_rules" value={s.gym_rules?.text} defaultText={DEFAULTS.gym_rules} note="Shown to members during registration and printed on their confirmation." saved={savedKey === 'gym_rules'} onSave={(text) => save('gym_rules', { text }, 'rules')} />
      <TextSection title="Indemnity Waiver" k="indemnity_text" value={s.indemnity_text?.text} defaultText={DEFAULTS.indemnity_text} note="Legal waiver the member must accept before joining (CPA-aligned)." saved={savedKey === 'indemnity_text'} onSave={(text) => save('indemnity_text', { text }, 'terms')} />
      <TextSection title="Membership Contract" k="contract_text" value={s.contract_text?.text} defaultText={DEFAULTS.contract_text} note="Your membership terms: billing, cancellation (20 business days, CPA), conduct." saved={savedKey === 'contract_text'} onSave={(text) => save('contract_text', { text }, 'terms')} />
      <TextSection title="POPIA Privacy Policy" k="popia_text" value={s.popia_text?.text} defaultText={DEFAULTS.popia_text} note="How you process members' personal information (POPIA compliant)." saved={savedKey === 'popia_text'} onSave={(text) => save('popia_text', { text }, 'terms')} />
    </AdminShell>
  );
}

const DEFAULTS = {
  gym_profile: {
    name: 'Yoyo GYM',
    tagline: 'Train harder. Live stronger.',
    accent_color: '#E63946',
    operating_hours: 'Mon–Fri 05:00–21:00 · Sat–Sun 07:00–18:00',
    welcome_message: 'Welcome to Yoyo GYM — your journey to a stronger, healthier you starts here. Scan, register, and let’s get moving.',
    website: '',
  },
  gym_rules: `1. Always carry and present your membership for access.
2. Wipe down equipment after every use and re-rack your weights.
3. Appropriate gym attire and closed training shoes are required.
4. Respect staff, trainers and fellow members at all times.
5. Personal belongings are the member's responsibility — use the lockers provided.
6. No outside trainers may operate on the gym floor without authorisation.
7. Report any faulty equipment or injuries to reception immediately.
8. The gym reserves the right to suspend membership for serious misconduct.`,
  indemnity_text:
    'I acknowledge that physical exercise carries inherent risks including injury or illness. ' +
    'I confirm that I am physically capable of participating in a gym environment. I indemnify Yoyo GYM and ' +
    'its staff against any injury, illness, loss, or damage arising from my use of the facilities, to the extent ' +
    'permitted by South African law.',
  contract_text:
    'MEMBERSHIP CONTRACT & TERMS\n\n' +
    '1. Billing: Monthly fees are collected by debit order / card on the agreed billing date.\n' +
    '2. Cancellation: 20 business days written notice is required (Consumer Protection Act compliant).\n' +
    '3. Early cancellation of a fixed-term contract may attract a reasonable cancellation fee.\n' +
    '4. Members agree to follow the gym rules and code of conduct at all times.\n' +
    '5. Guests are subject to the gym guest policy and applicable fees.\n' +
    '6. In a medical emergency, the gym may obtain emergency assistance on the member’s behalf.\n' +
    '7. Personal information is processed in line with POPIA (see privacy policy).',
  popia_text:
    'PRIVACY POLICY (POPIA)\n\n' +
    'Yoyo GYM processes your personal information solely to administer your membership, payments, health & safety ' +
    'screening, and communications. Your data is stored securely and is never sold. You may request access to, ' +
    'correction of, or deletion of your personal information at any time. (Protection of Personal Information Act, 2013.)',
};

const TIERS = ['basic', 'standard', 'premium', 'vip'];
const DEFAULT_COMPLIANCE = {
  capacity: 120,
  session_minutes: 120,
  peak_hours: { start: 17, end: 20 },
  plan_rules: {
    basic: { access: 'off_peak', classes_per_month: 0 },
    standard: { access: 'anytime', classes_per_month: 4 },
    premium: { access: 'anytime', classes_per_month: -1 },
    vip: { access: 'anytime', classes_per_month: -1 },
  },
};

function ComplianceSection({ initial, onSave, saved }) {
  const [c, setC] = useState({ ...DEFAULT_COMPLIANCE, ...(initial || {}), peak_hours: { ...DEFAULT_COMPLIANCE.peak_hours, ...(initial?.peak_hours || {}) }, plan_rules: { ...DEFAULT_COMPLIANCE.plan_rules, ...(initial?.plan_rules || {}) } });
  useEffect(() => {
    if (initial) setC((p) => ({ ...DEFAULT_COMPLIANCE, ...initial, peak_hours: { ...DEFAULT_COMPLIANCE.peak_hours, ...(initial.peak_hours || {}) }, plan_rules: { ...DEFAULT_COMPLIANCE.plan_rules, ...(initial.plan_rules || {}) } }));
  }, [JSON.stringify(initial)]); // eslint-disable-line
  const setRule = (t, k, v) => setC({ ...c, plan_rules: { ...c.plan_rules, [t]: { ...c.plan_rules[t], [k]: v } } });

  return (
    <div className="card mt-6">
      <h2 className="mb-1 font-display uppercase text-body">Access &amp; Compliance</h2>
      <p className="mb-3 text-xs text-muted">Powers the scan card, attendance board, plan-limit enforcement and adherence scoring.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Gym capacity"><input className="field" type="number" value={c.capacity} onChange={(e) => setC({ ...c, capacity: Number(e.target.value) })} /></Field>
        <Field label="Session length (min)"><input className="field" type="number" value={c.session_minutes} onChange={(e) => setC({ ...c, session_minutes: Number(e.target.value) })} /></Field>
        <Field label="Peak hours (24h)">
          <div className="flex gap-2">
            <input className="field" type="number" value={c.peak_hours.start} onChange={(e) => setC({ ...c, peak_hours: { ...c.peak_hours, start: Number(e.target.value) } })} />
            <input className="field" type="number" value={c.peak_hours.end} onChange={(e) => setC({ ...c, peak_hours: { ...c.peak_hours, end: Number(e.target.value) } })} />
          </div>
        </Field>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted"><tr><th className="py-1">Tier</th><th>Access</th><th>Classes / month (-1 = unlimited)</th></tr></thead>
          <tbody>
            {TIERS.map((t) => (
              <tr key={t} className="border-t border-white/5">
                <td className="py-1.5 uppercase text-body">{t}</td>
                <td>
                  <select className="field w-32 py-1" value={c.plan_rules[t]?.access || 'anytime'} onChange={(e) => setRule(t, 'access', e.target.value)}>
                    <option value="anytime">Anytime</option>
                    <option value="off_peak">Off-peak only</option>
                  </select>
                </td>
                <td><input className="field w-24 py-1" type="number" value={c.plan_rules[t]?.classes_per_month ?? 0} onChange={(e) => setRule(t, 'classes_per_month', Number(e.target.value))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button className="btn-primary px-4 py-2 text-sm" onClick={() => onSave(c)}>Save</button>
        {saved && <span className="text-sm text-success">Saved ✓</span>}
      </div>
    </div>
  );
}

function AdminFaceEnroll() {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  async function onCapture(result) {
    if (!result?.descriptor) { setOpen(false); return; }
    try {
      await apiFetch('/admin/enroll-face', { method: 'POST', body: { descriptor: result.descriptor } });
      setMsg('Face enrolled — you can now log in with your face.');
    } catch (e) {
      setMsg(e.message);
    } finally {
      setOpen(false);
    }
  }
  return (
    <div className="card mt-6">
      <h2 className="mb-1 font-display uppercase text-body">Admin Face Login (QR Type C)</h2>
      <p className="mb-3 text-xs text-muted">Enrol your face so you can unlock the admin panel by face scan at the gate.</p>
      {msg && <p className="mb-3 text-sm text-success">{msg}</p>}
      {open ? (
        <div className="max-w-xs">
          <FaceCapture onSubmit={onCapture} />
        </div>
      ) : (
        <button className="btn-primary px-4 py-2 text-sm" onClick={() => { setMsg(''); setOpen(true); }}>Enrol my face</button>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted">{label}</label>
      {children}
    </div>
  );
}

function Section({ title, fields, initial, numeric, note, onSave, saved }) {
  const [v, setV] = useState(initial);
  useEffect(() => setV(initial), [JSON.stringify(initial)]); // eslint-disable-line
  return (
    <div className="card mt-6">
      <h2 className="mb-3 font-display uppercase text-body">{title}</h2>
      {note && <p className="mb-3 text-xs text-muted">{note}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(([key, label]) => (
          <div key={key}>
            <label className="mb-1 block text-xs text-muted">{label}</label>
            <input
              className="field"
              value={v[key] ?? ''}
              onChange={(e) => setV({ ...v, [key]: numeric ? Number(e.target.value) : e.target.value })}
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button className="btn-primary px-4 py-2 text-sm" onClick={() => onSave(v)}>Save</button>
        {saved && <span className="text-sm text-success">Saved ✓</span>}
      </div>
    </div>
  );
}

function TextSection({ title, value, defaultText = '', note, onSave, saved }) {
  // Pre-fill the professional default when nothing is saved yet, so the admin
  // can review/edit and save rather than start from a blank box.
  const [t, setT] = useState(value ?? defaultText);
  useEffect(() => setT(value ?? defaultText), [value, defaultText]);
  return (
    <div className="card mt-6">
      <h2 className="mb-1 font-display uppercase text-body">{title}</h2>
      {note && <p className="mb-3 text-xs text-muted">{note}</p>}
      <textarea className="field min-h-[140px]" value={t} onChange={(e) => setT(e.target.value)} />
      <div className="mt-3 flex items-center gap-3">
        <button className="btn-primary px-4 py-2 text-sm" onClick={() => onSave(t)}>Save</button>
        {saved && <span className="text-sm text-success">Saved ✓</span>}
        <button className="text-xs text-muted hover:text-body" onClick={() => setT(defaultText)}>Reset to default</button>
      </div>
    </div>
  );
}
