// Membership selector (spec STEP 8). Multi-stage card UI:
//   category -> (full: tier card -> contract duration) | pack | day pass | trial
// Prices are pulled from the catalog (Supabase). Submits a normalised
// membership object computed via the shared pricing module.
import { useState } from 'react';
import { useCatalog } from '../../lib/useCatalog.js';
import {
  computeMembership,
  formatZAR,
  DURATION_LABELS,
  monthlyForDuration,
} from '../../../shared/pricing.js';

const CATEGORY_LABELS = {
  full: 'Full Membership',
  session_pack: 'Session Pack',
  day_pass: 'Day Pass',
  trial: 'Trial Membership',
};
const CATEGORY_ORDER = ['full', 'session_pack', 'day_pass', 'trial'];
const DURATIONS = ['month_to_month', '3_month', '6_month', '12_month'];

export default function MembershipControl({ defaultValue, onSubmit }) {
  const { catalog, loading, error } = useCatalog();
  const [stage, setStage] = useState('category');
  const [chosenPlan, setChosenPlan] = useState(null);

  if (loading) return <Loading text="Loading membership options…" />;
  if (error) return <ErrorBox text={error} />;
  if (!catalog?.plans?.length) return <ErrorBox text="No membership plans are configured yet." />;

  const discounts = catalog.contract_discounts;
  const byType = (t) => catalog.plans.filter((p) => p.visit_type === t);
  const categories = CATEGORY_ORDER.filter((t) => byType(t).length > 0);

  // ---- category picker ----
  if (stage === 'category') {
    return (
      <div className="grid gap-3">
        {defaultValue?.plan_id && (
          <p className="text-xs text-muted">
            Current choice: {defaultValue.plan_name}
            {defaultValue.contract_label ? ` · ${defaultValue.contract_label}` : ''}
          </p>
        )}
        {categories.map((t) => (
          <CardButton
            key={t}
            title={CATEGORY_LABELS[t]}
            onClick={() => {
              if (t === 'full' || t === 'session_pack') {
                setStage(t);
              } else {
                // single-option categories submit immediately
                onSubmit(computeMembership(byType(t)[0], null, discounts));
              }
            }}
          />
        ))}
      </div>
    );
  }

  // ---- full membership: tier cards ----
  if (stage === 'full') {
    return (
      <div className="space-y-3">
        <BackLink onClick={() => setStage('category')} />
        {byType('full').map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            priceLine={`${formatZAR(plan.monthly_price)} / month`}
            onSelect={() => {
              setChosenPlan(plan);
              setStage('full_duration');
            }}
          />
        ))}
      </div>
    );
  }

  // ---- full membership: contract duration ----
  if (stage === 'full_duration' && chosenPlan) {
    return (
      <div className="space-y-3">
        <BackLink onClick={() => setStage('full')} />
        <p className="text-sm text-muted">
          {chosenPlan.name} — choose your commitment. Longer contracts save you more.
        </p>
        {DURATIONS.map((d) => {
          const monthly = monthlyForDuration(chosenPlan, d, discounts);
          const disc = Number(discounts?.[d] || 0);
          return (
            <CardButton
              key={d}
              title={DURATION_LABELS[d]}
              subtitle={`${formatZAR(monthly)}/month${disc ? ` · save ${disc}%` : ''}`}
              onClick={() => onSubmit(computeMembership(chosenPlan, d, discounts))}
            />
          );
        })}
      </div>
    );
  }

  // ---- session packs ----
  if (stage === 'session_pack') {
    return (
      <div className="space-y-3">
        <BackLink onClick={() => setStage('category')} />
        {byType('session_pack').map((plan) => {
          const total = Number(plan.session_pack_price || 0);
          const per = plan.session_pack_size ? total / plan.session_pack_size : 0;
          return (
            <PlanCard
              key={plan.id}
              plan={plan}
              priceLine={`${formatZAR(total)} · ${formatZAR(per)}/session`}
              onSelect={() => onSubmit(computeMembership(plan, null, discounts))}
            />
          );
        })}
      </div>
    );
  }

  return null;
}

// ---- small presentational helpers ----
function Loading({ text }) {
  return <p className="py-6 text-center text-muted">{text}</p>;
}
function ErrorBox({ text }) {
  return <p className="rounded-lg bg-error/10 px-3 py-3 text-sm text-error">{text}</p>;
}
function BackLink({ onClick }) {
  return (
    <button onClick={onClick} className="text-sm text-muted hover:text-body">
      ← Other options
    </button>
  );
}
function CardButton({ title, subtitle, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-xl border border-accent/40 bg-elevated px-4 py-4 text-left transition hover:border-accent hover:bg-accent-soft"
    >
      <div>
        <div className="font-display uppercase tracking-wide text-body">{title}</div>
        {subtitle && <div className="text-sm text-muted">{subtitle}</div>}
      </div>
      <span className="text-accent">→</span>
    </button>
  );
}
function PlanCard({ plan, priceLine, onSelect }) {
  const benefits = Array.isArray(plan.benefits) ? plan.benefits : [];
  return (
    <div
      className={`relative rounded-2xl border p-4 ${
        plan.is_featured ? 'border-accent bg-accent-soft' : 'border-white/10 bg-elevated'
      }`}
    >
      {plan.is_featured && (
        <span className="absolute -top-2 right-4 rounded-full bg-accent px-3 py-0.5 text-xs font-bold uppercase text-black">
          Most Popular
        </span>
      )}
      <div className="font-display text-xl uppercase text-body">{plan.name}</div>
      {plan.description && <p className="mt-1 text-sm text-muted">{plan.description}</p>}
      {benefits.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-body">
          {benefits.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-accent">✓</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 font-display text-lg text-accent">{priceLine}</div>
      <button className="btn-primary mt-3 w-full" onClick={onSelect}>
        Choose {plan.name}
      </button>
    </div>
  );
}
