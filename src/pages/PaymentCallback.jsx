// /payment/callback — where Paystack redirects after checkout. Verifies the
// transaction server-side and shows the confirmation (or a retry on failure).
import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import SuccessScreen from '../chatbot/components/SuccessScreen.jsx';

const PROGRESS_KEY = 'gym_registration_progress_v1';

export default function PaymentCallback() {
  const [params] = useSearchParams();
  const reference = params.get('reference') || params.get('trxref');
  const [state, setState] = useState('verifying'); // verifying | success | failed | error
  const [member, setMember] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!reference) {
      setState('error');
      setMsg('Missing payment reference.');
      return;
    }
    let active = true;
    (async () => {
      try {
        const res = await apiFetch('/payments/verify', {
          method: 'POST',
          auth: false,
          body: { reference },
        });
        if (!active) return;
        if (res.status === 'success') {
          localStorage.removeItem(PROGRESS_KEY); // registration is complete
          setMember(res.member);
          setState('success');
        } else {
          setState('failed');
        }
      } catch (err) {
        if (active) {
          setState('error');
          setMsg(err.message || 'Verification failed.');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [reference]);

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center bg-bg px-4 py-8">
      {state === 'verifying' && (
        <p className="text-center text-muted">Confirming your payment…</p>
      )}

      {state === 'success' && member && (
        <SuccessScreen
          result={{
            full_name: member.full_name,
            membership_number: member.membership_number,
            verification_code: member.verification_code,
            plan_name: member.plan_name,
            amount_due_today: member.amount_due_today,
            recurring_amount: member.recurring_amount,
            parq_flag: member.parq_flag,
          }}
          paid
        />
      )}

      {(state === 'failed' || state === 'error') && (
        <div className="card text-center">
          <h2 className="font-display text-xl uppercase text-error">Payment not completed</h2>
          <p className="mt-2 text-sm text-muted">
            {msg || 'Your payment was not successful. You can try again or pay at reception.'}
          </p>
          <Link to="/" className="btn-outline mt-6">
            Back to start
          </Link>
        </div>
      )}
    </div>
  );
}
