// What this gym offers (CLAUDE.md §41.1 Q1): its membership plans and prices,
// its add-on services, what members can use in the app, and its free
// facilities — everything the owner wrote or switched on, and nothing else.
// Shown before joining (the gym's front page) and after (the member portal).
//
// Every figure comes from the gym's own records: plans and add-ons from
// /api/catalog, services and facilities from /api/content. A section with
// nothing in it is left out rather than shown empty.
import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { formatZAR } from '../../shared/pricing.js';

const Check = () => (
  <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 flex-none text-accent" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

const benefitsOf = (plan) =>
  (Array.isArray(plan.benefits) ? plan.benefits : []).map((b) => (typeof b === 'string' ? b : b?.text || '')).filter(Boolean);

export default function GymOffer({ heading = 'What we offer' }) {
  const [offer, setOffer] = useState(null);
  const [catalog, setCatalog] = useState(null);

  useEffect(() => {
    let live = true;
    apiFetch('/content', { auth: false }).then((d) => live && setOffer(d.offer || null)).catch(() => {});
    apiFetch('/catalog', { auth: false }).then((d) => live && setCatalog(d)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const plans = catalog?.plans || [];
  const addons = catalog?.addons || [];
  const services = offer?.services || [];
  const facilities = offer?.facilities || [];
  if (!plans.length && !addons.length && !services.length && !facilities.length) return null;

  const h2 = 'mb-3 font-body text-xs font-bold uppercase tracking-[0.14em] text-muted';

  return (
    <section className="w-full text-left" aria-label={heading}>
      <h2 className="mb-5 font-body text-xl font-bold text-body">{heading}</h2>

      {plans.length > 0 && (
        <div className="mb-8">
          <h3 className={h2}>Membership plans</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {plans.map((p) => (
              <div key={p.id} className={`card relative ${p.is_featured ? 'border-accent/50' : ''}`}>
                {p.is_featured && (
                  <span className="absolute right-4 top-4 rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold text-accent-ink">Most popular</span>
                )}
                <div className="pr-24 font-semibold text-body">{p.name}</div>
                <div className="mt-2 text-2xl font-extrabold text-body">
                  {formatZAR(p.monthly_price)}
                  <span className="text-sm font-medium text-muted"> / month</span>
                </div>
                {Number(p.joining_fee) > 0 && <div className="text-xs text-muted">Joining fee {formatZAR(p.joining_fee)}</div>}
                {p.description && <p className="mt-2 text-sm text-muted">{p.description}</p>}
                {benefitsOf(p).length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {benefitsOf(p).map((b) => (
                      <li key={b} className="flex gap-2 text-sm text-body"><Check />{b}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {addons.length > 0 && (
        <div className="mb-8">
          <h3 className={h2}>Add-on services</h3>
          <div className="card !p-0 overflow-hidden">
            {addons.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-4 border-t border-white/5 px-5 py-3.5 first:border-t-0">
                <div className="min-w-0">
                  <div className="font-semibold text-body">{a.name}</div>
                  {a.description && <div className="text-sm text-muted">{a.description}</div>}
                </div>
                <div className="flex-none text-right text-sm font-semibold text-body">
                  {formatZAR(a.price)}
                  {a.billing_type && a.billing_type !== 'once' && <span className="block text-xs font-normal text-muted">{a.billing_type}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {services.length > 0 && (
        <div className="mb-8">
          <h3 className={h2}>In your app</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {services.map((s) => (
              <li key={s.key} className="flex gap-2 text-sm text-body"><Check />{s.text}</li>
            ))}
          </ul>
        </div>
      )}

      {facilities.length > 0 && (
        <div className="mb-4">
          <h3 className={h2}>Facilities</h3>
          <div className="flex flex-wrap gap-2">
            {facilities.map((f) => (
              <span key={f} className="rounded-full border border-white/15 bg-white/[0.03] px-3 py-1.5 text-sm text-body">{f}</span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
