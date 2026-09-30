// "Your Yoyo Gyms plan" — at the top of the owner's dashboard (CLAUDE.md §48).
//
// The plan, its monthly fee, the free trial's dates or the date it is paid
// until, and Pay now, which opens the secure Paystack page. The wording is the
// Yoyo account page's own (shared/yoyo-plan.js), so the two never disagree.
//
// Owner only, and the server says so too. Inside the store app: the plan and
// where it stands only — no price and no Pay button (§48.1 Q2); the server
// leaves the price out and refuses the payment there as well.
import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { planFee, planWords, cardText } from '../../shared/yoyo-plan.js';
import { isStoreApp } from '../../shared/store-app.js';

const DOT = { good: 'bg-success', calm: 'bg-accent', warn: 'bg-warning', bad: 'bg-error' };

export default function YoyoPlanCard() {
  const [data, setData] = useState(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Best-effort: the dashboard is the gym's, and never waits on this card.
    apiFetch('/admin/yoyo-plan').then(setData).catch(() => setData(null));
  }, []);

  if (!data?.plan || !data.standing) return null;

  const inApp = data.inApp || (typeof navigator !== 'undefined' && isStoreApp(navigator.userAgent));
  const fee = inApp ? '' : planFee(data.plan.price_cents, data.plan.currency);
  const words = planWords(data.standing, { inApp, priced: Boolean(fee) });
  const canPay = !inApp && data.standing.canPay && Boolean(fee);

  // The server hands back a five-minute ticket for THIS gym; the page posts it
  // to the platform, which opens Paystack. A form, not a link: the ticket
  // never sits in an address bar or a history.
  async function pay() {
    setError('');
    setPaying(true);
    try {
      const { action, ticket } = await apiFetch('/admin/yoyo-plan', { method: 'POST' });
      const form = document.createElement('form');
      form.method = 'post';
      form.action = action;
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'ticket';
      input.value = ticket;
      form.appendChild(input);
      document.body.appendChild(form);
      form.submit();
    } catch (e) {
      setError(e.message);
      setPaying(false);
    }
  }

  return (
    <section className="card mt-6" aria-labelledby="yoyo-plan-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 id="yoyo-plan-title" className="font-body text-xs font-bold uppercase tracking-[0.14em] text-muted">
            Your Yoyo Gyms plan
          </h2>
          <p className="mt-2 font-body text-xl font-extrabold tracking-tight text-body">
            {data.plan.label || 'Your plan'}
            {fee && <span className="ml-2 whitespace-nowrap text-base font-semibold text-muted">· {fee}</span>}
          </p>
          <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-body">
            <span className={`h-2.5 w-2.5 flex-none rounded-full ${DOT[words.tone] || DOT.calm}`} aria-hidden="true" />
            {words.status}
          </p>
          {words.note && <p className="mt-1 max-w-prose text-sm text-muted">{words.note}</p>}
          {!inApp && data.card && (
            <p className="mt-1 text-sm text-muted">
              Saved card: {cardText(data.card.brand, data.card.last4)}.
            </p>
          )}
        </div>
        {canPay && (
          <button
            type="button"
            onClick={pay}
            disabled={paying}
            className={`${words.urgent ? 'btn-primary' : 'btn-outline'} min-h-[44px] self-start !px-5 !py-2.5 sm:self-auto`}
          >
            {paying ? 'Opening Paystack…' : words.button}
          </button>
        )}
      </div>
      {canPay && (
        <p className="mt-3 text-xs text-muted">
          Paid securely on Paystack. Yoyo Gyms never sees or stores your card number.
        </p>
      )}
      {error && <p className="mt-3 rounded-xl bg-error/10 px-4 py-3 text-sm text-error">{error}</p>}
    </section>
  );
}
