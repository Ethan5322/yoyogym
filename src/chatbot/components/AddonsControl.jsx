// Add-on services selector (spec STEP 9). Grouped by category, multi-select,
// with a live running total and a "No thanks" skip. Prices from the catalog.
import { useState } from 'react';
import { useCatalog } from '../../lib/useCatalog.js';
import { formatZAR, addonsTotal } from '../../../shared/pricing.js';

const CATEGORY_TITLES = {
  personal_training: 'Personal Training',
  class: 'Fitness Classes',
  additional: 'Additional Services',
};
const BILLING_SUFFIX = { monthly: '/month', per_session: '/session', once_off: '' };

export default function AddonsControl({ defaultValue, onSubmit }) {
  const { catalog, loading, error } = useCatalog();
  const [selectedIds, setSelectedIds] = useState(
    Array.isArray(defaultValue) ? defaultValue.map((a) => a.id) : []
  );

  if (loading) return <p className="py-6 text-center text-muted">Loading add-ons…</p>;
  if (error) return <p className="rounded-lg bg-error/10 px-3 py-3 text-sm text-error">{error}</p>;

  const addons = catalog?.addons || [];
  if (!addons.length) {
    return (
      <button className="btn-primary w-full" onClick={() => onSubmit([])}>
        Continue
      </button>
    );
  }

  const selected = addons.filter((a) => selectedIds.includes(a.id));
  const total = addonsTotal(selected);

  // group by category, preserving a sensible order
  const groups = {};
  for (const a of addons) {
    const key = CATEGORY_TITLES[a.category] ? a.category : 'additional';
    (groups[key] ||= []).push(a);
  }

  function toggle(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function submitSelected() {
    onSubmit(
      selected.map((a) => ({
        id: a.id,
        name: a.name,
        price: Number(a.price || 0),
        billing_type: a.billing_type,
        category: a.category,
      }))
    );
  }

  return (
    <div>
      <div className="max-h-[42vh] space-y-4 overflow-y-auto pr-1">
        {Object.entries(groups).map(([cat, items]) => (
          <div key={cat}>
            <h3 className="mb-2 font-display text-sm uppercase tracking-wider text-accent">
              {CATEGORY_TITLES[cat] || 'Additional Services'}
            </h3>
            <div className="space-y-2">
              {items.map((a) => {
                const on = selectedIds.includes(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() => toggle(a.id)}
                    className={`flex w-full items-start justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${
                      on ? 'border-accent bg-accent-soft' : 'border-white/10 bg-elevated'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-body">{a.name}</div>
                      {a.description && <div className="text-xs text-muted">{a.description}</div>}
                      <div className="mt-1 text-sm text-accent">
                        {formatZAR(a.price)}
                        {BILLING_SUFFIX[a.billing_type] || ''}
                      </div>
                    </div>
                    <span className={`mt-1 ${on ? 'text-accent' : 'text-muted'}`}>{on ? '✓' : '+'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selected.length > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-lg bg-elevated px-4 py-2 text-sm">
          <span className="text-muted">Add-ons total</span>
          <span className="font-display text-accent">{formatZAR(total)}</span>
        </div>
      )}

      <div className="mt-3 flex gap-3">
        <button className="btn-primary flex-1" onClick={submitSelected}>
          {selected.length ? `Add ${selected.length} & Continue` : 'Continue'}
        </button>
        <button className="btn-outline" onClick={() => onSubmit([])}>
          No thanks
        </button>
      </div>
    </div>
  );
}
