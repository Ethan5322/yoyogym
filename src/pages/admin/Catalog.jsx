// Plans & Add-ons editor (spec 4.13). Owner/Manager. Prices configured here
// flow straight into the registration chatbot (which reads from the DB).
import { useEffect, useState } from 'react';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';

// A new plan starts with NO price, not R0: a blank price is refused when the
// plan is switched on, so nothing is ever sold at R0 by accident (§45.1 Q1).
const planBlank = { name: '', tier: '', visit_type: 'full', monthly_price: '', joining_fee: 0, is_featured: false, is_enabled: true, sort_order: 0 };

// The price each kind of plan is SOLD at (shared/pricing.js PRICE_FIELD), and
// the extra number it needs. The screen used to offer only "Monthly price",
// so a day pass, a session pack or a trial could never be given its own price.
const PRICE_INPUTS = {
  full: [['monthly_price', 'Monthly price']],
  session_pack: [['session_pack_size', 'Sessions in the pack'], ['session_pack_price', 'Pack price']],
  day_pass: [['day_pass_price', 'Day pass price']],
  trial: [['trial_days', 'Trial length (days)'], ['trial_price', 'Trial price (0 for free)']],
};
const NUMERIC = ['monthly_price', 'joining_fee', 'session_pack_size', 'session_pack_price', 'day_pass_price', 'trial_days', 'trial_price'];
// Blank stays blank (null on the server) — Number('') would be 0.
const numberOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

function priceLine(p) {
  const [[field]] = PRICE_INPUTS[p.visit_type] || PRICE_INPUTS.full;
  const price = p[field];
  const shown = price === null || price === undefined ? 'no price yet' : `R${price}`;
  return p.visit_type === 'full' || !PRICE_INPUTS[p.visit_type] ? `${shown}/mo` : shown;
}
const addonBlank = { name: '', category: 'additional', price: 0, billing_type: 'monthly', is_enabled: true };

export default function Catalog() {
  const [plans, setPlans] = useState([]);
  const [addons, setAddons] = useState([]);
  const [planForm, setPlanForm] = useState(null);
  const [addonForm, setAddonForm] = useState(null);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');

  function load() {
    apiFetch('/admin/plans').then((d) => setPlans(d.plans)).catch((e) => setError(e.message));
    apiFetch('/admin/addons').then((d) => setAddons(d.addons)).catch(() => {});
  }
  useEffect(load, []);

  async function savePlan() {
    const body = { ...planForm };
    for (const f of NUMERIC) if (f in body) body[f] = numberOrNull(body[f]);
    setFormError('');
    try {
      if (planForm.id) await apiFetch(`/admin/plans?id=${planForm.id}`, { method: 'PATCH', body });
      else await apiFetch('/admin/plans', { method: 'POST', body });
    } catch (e) {
      // Said in the form, which stays open — e.g. "Set this plan's price first".
      setFormError(e.message || 'That plan was not saved.');
      return;
    }
    setPlanForm(null);
    load();
  }
  async function saveAddon() {
    const body = { ...addonForm, price: Number(addonForm.price) };
    if (addonForm.id) await apiFetch(`/admin/addons?id=${addonForm.id}`, { method: 'PATCH', body });
    else await apiFetch('/admin/addons', { method: 'POST', body });
    setAddonForm(null);
    load();
  }

  return (
    <AdminShell>
      <h1 className="text-2xl font-bold uppercase text-body">Plans &amp; Add-ons</h1>
      {error && <p className="mt-4 text-error">{error}</p>}

      <div className="mt-6 flex items-center justify-between">
        <h2 className="font-display uppercase text-body">Membership Plans</h2>
        <button className="btn-primary px-3 py-1 text-sm" onClick={() => { setFormError(''); setPlanForm({ ...planBlank }); }}>+ Plan</button>
      </div>
      <div className="mt-2 space-y-2">
        {plans.map((p) => (
          <div key={p.id} className="card flex items-center justify-between">
            <div>
              <div className="font-display uppercase text-body">{p.name} {p.is_featured && <span className="text-accent">★</span>} {!p.is_enabled && '· disabled'}</div>
              <div className="text-xs text-muted">{p.visit_type} {p.tier ? `· ${p.tier}` : ''} · {priceLine(p)} · join R{p.joining_fee ?? 0}</div>
            </div>
            <button className="btn-outline px-3 py-1 text-sm" onClick={() => { setFormError(''); setPlanForm({ ...planBlank, ...p, tier: p.tier || '' }); }}>Edit</button>
          </div>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-display uppercase text-body">Add-on Services</h2>
        <button className="btn-primary px-3 py-1 text-sm" onClick={() => setAddonForm({ ...addonBlank })}>+ Add-on</button>
      </div>
      <div className="mt-2 space-y-2">
        {addons.map((a) => (
          <div key={a.id} className="card flex items-center justify-between">
            <div>
              <div className="font-display uppercase text-body">{a.name} {!a.is_enabled && '· disabled'}</div>
              <div className="text-xs text-muted">{a.category} · R{a.price} {a.billing_type}</div>
            </div>
            <button className="btn-outline px-3 py-1 text-sm" onClick={() => setAddonForm({ ...addonBlank, ...a })}>Edit</button>
          </div>
        ))}
      </div>

      {planForm && (
        <Modal onClose={() => setPlanForm(null)} title={`${planForm.id ? 'Edit' : 'New'} Plan`} onSave={savePlan}>
          <input className="field" placeholder="Name" value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} />
          <select className="field" value={planForm.visit_type} onChange={(e) => setPlanForm({ ...planForm, visit_type: e.target.value })}>
            {['full', 'session_pack', 'day_pass', 'trial'].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select className="field" value={planForm.tier} onChange={(e) => setPlanForm({ ...planForm, tier: e.target.value })}>
            <option value="">No tier</option>
            {['basic', 'standard', 'premium', 'vip'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          {(PRICE_INPUTS[planForm.visit_type] || PRICE_INPUTS.full).map(([field, label]) => (
            <label key={field} className="block text-sm text-muted">{label}
              <input className="field mt-1" type="number" min="0" step="any" placeholder={label} value={planForm[field] ?? ''}
                onChange={(e) => setPlanForm({ ...planForm, [field]: e.target.value })} />
            </label>
          ))}
          <label className="block text-sm text-muted">Joining fee
            <input className="field mt-1" type="number" min="0" step="any" placeholder="Joining fee" value={planForm.joining_fee ?? ''} onChange={(e) => setPlanForm({ ...planForm, joining_fee: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={planForm.is_featured} onChange={(e) => setPlanForm({ ...planForm, is_featured: e.target.checked })} /> Most popular</label>
          <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={planForm.is_enabled} onChange={(e) => setPlanForm({ ...planForm, is_enabled: e.target.checked })} /> Enabled — members can choose it</label>
          {formError && <p className="rounded-lg bg-error/10 px-3 py-2 text-sm text-error">{formError}</p>}
        </Modal>
      )}

      {addonForm && (
        <Modal onClose={() => setAddonForm(null)} title={`${addonForm.id ? 'Edit' : 'New'} Add-on`} onSave={saveAddon}>
          <input className="field" placeholder="Name" value={addonForm.name} onChange={(e) => setAddonForm({ ...addonForm, name: e.target.value })} />
          <select className="field" value={addonForm.category} onChange={(e) => setAddonForm({ ...addonForm, category: e.target.value })}>
            {['personal_training', 'class', 'additional'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input className="field" type="number" placeholder="Price" value={addonForm.price} onChange={(e) => setAddonForm({ ...addonForm, price: e.target.value })} />
          <select className="field" value={addonForm.billing_type} onChange={(e) => setAddonForm({ ...addonForm, billing_type: e.target.value })}>
            {['once_off', 'monthly', 'per_session'].map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={addonForm.is_enabled} onChange={(e) => setAddonForm({ ...addonForm, is_enabled: e.target.checked })} /> Enabled</label>
        </Modal>
      )}
    </AdminShell>
  );
}

function Modal({ title, children, onClose, onSave }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="card w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display uppercase text-body">{title}</h2>
        {children}
        <div className="flex gap-3">
          <button className="btn-primary flex-1" onClick={onSave}>Save</button>
          <button className="btn-outline" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
