// Plans & Add-ons editor (spec 4.13). Owner/Manager. Prices configured here
// flow straight into the registration chatbot (which reads from the DB).
import { useEffect, useState } from 'react';
import AdminShell from '../../components/AdminShell.jsx';
import { apiFetch } from '../../lib/api.js';

const planBlank = { name: '', tier: '', visit_type: 'full', monthly_price: 0, joining_fee: 0, is_featured: false, is_enabled: true, sort_order: 0 };
const addonBlank = { name: '', category: 'additional', price: 0, billing_type: 'monthly', is_enabled: true };

export default function Catalog() {
  const [plans, setPlans] = useState([]);
  const [addons, setAddons] = useState([]);
  const [planForm, setPlanForm] = useState(null);
  const [addonForm, setAddonForm] = useState(null);
  const [error, setError] = useState('');

  function load() {
    apiFetch('/admin/plans').then((d) => setPlans(d.plans)).catch((e) => setError(e.message));
    apiFetch('/admin/addons').then((d) => setAddons(d.addons)).catch(() => {});
  }
  useEffect(load, []);

  async function savePlan() {
    const body = { ...planForm, monthly_price: Number(planForm.monthly_price), joining_fee: Number(planForm.joining_fee) };
    if (planForm.id) await apiFetch(`/admin/plans?id=${planForm.id}`, { method: 'PATCH', body });
    else await apiFetch('/admin/plans', { method: 'POST', body });
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
        <button className="btn-primary px-3 py-1 text-sm" onClick={() => setPlanForm({ ...planBlank })}>+ Plan</button>
      </div>
      <div className="mt-2 space-y-2">
        {plans.map((p) => (
          <div key={p.id} className="card flex items-center justify-between">
            <div>
              <div className="font-display uppercase text-body">{p.name} {p.is_featured && <span className="text-accent">★</span>} {!p.is_enabled && '· disabled'}</div>
              <div className="text-xs text-muted">{p.visit_type} {p.tier ? `· ${p.tier}` : ''} · R{p.monthly_price}/mo · join R{p.joining_fee}</div>
            </div>
            <button className="btn-outline px-3 py-1 text-sm" onClick={() => setPlanForm({ ...planBlank, ...p, tier: p.tier || '' })}>Edit</button>
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
          <input className="field" type="number" placeholder="Monthly price" value={planForm.monthly_price} onChange={(e) => setPlanForm({ ...planForm, monthly_price: e.target.value })} />
          <input className="field" type="number" placeholder="Joining fee" value={planForm.joining_fee} onChange={(e) => setPlanForm({ ...planForm, joining_fee: e.target.value })} />
          <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={planForm.is_featured} onChange={(e) => setPlanForm({ ...planForm, is_featured: e.target.checked })} /> Most popular</label>
          <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={planForm.is_enabled} onChange={(e) => setPlanForm({ ...planForm, is_enabled: e.target.checked })} /> Enabled</label>
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
