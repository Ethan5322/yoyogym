// Settings & configuration (spec 4.13). OWNER ONLY. Edits gym profile,
// notification contacts, contract discounts, and legal text — all stored as
// rows in the settings table and consumed across the app.
import { useEffect, useState } from 'react';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';

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

      <Section title="Gym Profile" saved={savedKey === 'gym_profile'}
        initial={s.gym_profile || {}}
        fields={[['name', 'Gym name'], ['accent_color', 'Accent colour (e.g. #E63946)'], ['phone', 'Phone'], ['email', 'Email'], ['address', 'Address']]}
        onSave={(v) => save('gym_profile', v, 'gym_profile')} />

      <Section title="Owner Notifications" saved={savedKey === 'notifications'}
        initial={s.notifications || {}}
        fields={[['owner_email', 'Owner email'], ['owner_whatsapp_phone', 'WhatsApp phone (+27…)'], ['owner_whatsapp_apikey', 'CallMeBot WhatsApp API key'], ['owner_telegram_user', 'Telegram username (@…)']]}
        note="CallMeBot needs a one-time activation per number/username. WhatsApp: message the CallMeBot number to get your API key. Telegram: start the CallMeBot and send /start."
        onSave={(v) => save('notifications', v, 'notifications')} />

      <Section title="Contract Discounts (%)" saved={savedKey === 'contract_discounts'}
        initial={s.contract_discounts || { month_to_month: 0, '3_month': 0, '6_month': 5, '12_month': 10 }}
        fields={[['month_to_month', 'Month-to-month'], ['3_month', '3 month'], ['6_month', '6 month'], ['12_month', '12 month']]}
        numeric
        onSave={(v) => save('contract_discounts', v, 'payment')} />

      <TextSection title="Indemnity Waiver" k="indemnity_text" value={s.indemnity_text?.text || ''} saved={savedKey === 'indemnity_text'} onSave={(text) => save('indemnity_text', { text }, 'terms')} />
      <TextSection title="Membership Contract" k="contract_text" value={s.contract_text?.text || ''} saved={savedKey === 'contract_text'} onSave={(text) => save('contract_text', { text }, 'terms')} />
      <TextSection title="POPIA Privacy Policy" k="popia_text" value={s.popia_text?.text || ''} saved={savedKey === 'popia_text'} onSave={(text) => save('popia_text', { text }, 'terms')} />
    </AdminShell>
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

function TextSection({ title, value, onSave, saved }) {
  const [t, setT] = useState(value);
  useEffect(() => setT(value), [value]);
  return (
    <div className="card mt-6">
      <h2 className="mb-3 font-display uppercase text-body">{title}</h2>
      <textarea className="field min-h-[120px]" value={t} onChange={(e) => setT(e.target.value)} />
      <div className="mt-3 flex items-center gap-3">
        <button className="btn-primary px-4 py-2 text-sm" onClick={() => onSave(t)}>Save</button>
        {saved && <span className="text-sm text-success">Saved ✓</span>}
      </div>
    </div>
  );
}
