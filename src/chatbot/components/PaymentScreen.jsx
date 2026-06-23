// Post-registration payment step (spec 2.3 STEP 10). Shows the amount due and
// starts the Paystack hosted checkout. On success Paystack redirects to
// /payment/callback which verifies and shows the confirmation.
import { useState } from 'react';
import { apiFetch } from '../../lib/api.js';
import { formatZAR } from '../../../shared/pricing.js';

export default function PaymentScreen({ result }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function pay() {
    setBusy(true);
    setError('');
    try {
      const { authorization_url } = await apiFetch('/payments/initialize', {
        method: 'POST',
        auth: false,
        body: {
          member_id: result.member_id,
          callback_url: `${window.location.origin}/payment/callback`,
        },
      });
      window.location.href = authorization_url; // hand off to Paystack
    } catch (err) {
      setError(err.message || 'Could not start payment.');
      setBusy(false);
    }
  }

  return (
    <div className="animate-fade-up space-y-4 text-center">
      <h2 className="font-display text-2xl uppercase text-body">Almost there!</h2>
      <p className="text-sm text-muted">
        {result.full_name?.split(' ')[0]}, complete your payment to activate your membership.
      </p>

      <div className="card">
        <div className="text-xs uppercase tracking-wider text-muted">Due today</div>
        <div className="mt-1 font-display text-4xl text-accent">
          {formatZAR(result.amount_due_today)}
        </div>
        <div className="mt-2 text-sm text-body">{result.plan_name}</div>
        {result.recurring_amount > 0 && (
          <div className="text-xs text-muted">
            then {formatZAR(result.recurring_amount)}/month
          </div>
        )}
      </div>

      {error && <p className="rounded-lg bg-error/10 px-3 py-2 text-sm text-error">{error}</p>}

      <button className="btn-primary w-full" onClick={pay} disabled={busy}>
        {busy ? 'Starting secure checkout…' : 'Pay Securely with Paystack'}
      </button>
      <p className="text-xs text-muted">
        Your membership number is <b>{result.membership_number}</b> — keep it safe.
      </p>
    </div>
  );
}
