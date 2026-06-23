// Membership summary & pricing breakdown (spec STEP 8 — section 8).
// Read-only review of everything chosen, with a confirm button. Editing is
// done via the engine's "go back" (the user can step back to any answer).
import { formatZAR, addonsTotal, totalDueToday } from '../../../shared/pricing.js';
import { parqAnyYes } from '../flow.js';

function Row({ label, value, strong }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted">{label}</span>
      <span className={strong ? 'font-display text-accent' : 'text-body'}>{value}</span>
    </div>
  );
}

export default function SummaryView({ answers, onSubmit }) {
  const m = answers.membership || {};
  const addons = answers.addons || [];
  const addonSum = addonsTotal(addons);
  const today = totalDueToday(m, addons);

  return (
    <div>
      <div className="card max-h-[46vh] space-y-1 overflow-y-auto">
        <h3 className="font-display text-sm uppercase tracking-wider text-accent">Member</h3>
        <Row label="Name" value={answers.full_name || '—'} />
        <Row label="Phone" value={answers.phone || '—'} />
        <Row label="Email" value={answers.email || '—'} />
        {parqAnyYes(answers) && (
          <p className="rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
            ⚠ Medical clearance required (PAR-Q). You can register today; please provide a
            doctor’s note before your first session.
          </p>
        )}

        <h3 className="mt-4 font-display text-sm uppercase tracking-wider text-accent">Membership</h3>
        <Row label="Plan" value={m.plan_name || '—'} />
        {m.contract_label && <Row label="Contract" value={m.contract_label} />}
        {m.sessions_total ? <Row label="Sessions" value={`${m.sessions_total} sessions`} /> : null}
        {m.visit_type === 'full' && (
          <>
            <Row label="Monthly fee" value={formatZAR(m.monthly_amount)} />
            <Row label="Joining fee" value={formatZAR(m.joining_fee)} />
          </>
        )}

        {addons.length > 0 && (
          <>
            <h3 className="mt-4 font-display text-sm uppercase tracking-wider text-accent">Add-ons</h3>
            {addons.map((a) => (
              <Row key={a.id} label={a.name} value={formatZAR(a.price)} />
            ))}
            <Row label="Add-ons subtotal" value={formatZAR(addonSum)} />
          </>
        )}

        <div className="my-3 border-t border-white/10" />
        <Row label="Total due today" value={formatZAR(today)} strong />
        {m.recurring_amount > 0 && (
          <Row label="Monthly thereafter" value={formatZAR(m.recurring_amount)} />
        )}
        {m.contract_value && <Row label="Total contract value" value={formatZAR(m.contract_value)} />}

        {answers.has_medical_aid && (
          <p className="mt-3 text-xs text-muted">
            Medical aid noted — our team will follow up on any eligible gym benefit.
          </p>
        )}
      </div>

      <button className="btn-primary mt-4 w-full" onClick={() => onSubmit(null)}>
        Looks good — Continue
      </button>
    </div>
  );
}
