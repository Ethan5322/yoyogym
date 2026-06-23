// Membership confirmation success screen (spec 2.3 STEP 11 / section 11).
// Shows the welcome, the prominent membership number + verification code,
// a plan/price summary, and "what happens next". The PDF download is wired
// in Phase 4; payment is collected in Phase 3.
import { useState } from 'react';
import { formatZAR } from '../../../shared/pricing.js';
import { apiFetch } from '../../lib/api.js';

export default function SuccessScreen({ result, paid = false }) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfErr, setPdfErr] = useState('');

  async function downloadPdf() {
    setPdfBusy(true);
    setPdfErr('');
    try {
      const data = await apiFetch('/members/document', {
        method: 'POST',
        auth: false,
        body: {
          membership_number: result.membership_number,
          verification_code: result.verification_code,
        },
      });
      // Lazy-loaded so jsPDF is not in the initial bundle (keeps load fast).
      const { generateMembershipPdf } = await import('../../lib/pdf/generateMembershipPdf.js');
      await generateMembershipPdf(data);
    } catch (err) {
      setPdfErr(err.message || 'Could not generate PDF.');
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="animate-fade-up space-y-4 text-center">
      <div className="text-5xl">🎉</div>
      <h2 className="font-display text-2xl uppercase text-success">
        Welcome, {result.full_name?.split(' ')[0]}!
      </h2>
      <p className="text-sm text-muted">Your membership has been created. Let’s get training! 💪</p>

      <div className="card space-y-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted">Membership Number</div>
          <div className="mt-1 font-display text-2xl tracking-wide text-body">
            {result.membership_number}
          </div>
        </div>
        <div className="border-t border-white/10" />
        <div>
          <div className="text-xs uppercase tracking-wider text-muted">Verification Code</div>
          <div className="mt-1 font-mono text-3xl font-bold tracking-[0.3em] text-accent">
            {result.verification_code}
          </div>
          <div className="mt-1 text-xs text-muted">Show this at reception for first-time access.</div>
        </div>
      </div>

      <div className="card space-y-1 text-left">
        <div className="flex justify-between">
          <span className="text-sm text-muted">Plan</span>
          <span className="text-body">{result.plan_name}</span>
        </div>
        {result.contract_label && (
          <div className="flex justify-between">
            <span className="text-sm text-muted">Contract</span>
            <span className="text-body">{result.contract_label}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-sm text-muted">Due today</span>
          <span className="font-display text-accent">{formatZAR(result.amount_due_today)}</span>
        </div>
        {result.recurring_amount > 0 && (
          <div className="flex justify-between">
            <span className="text-sm text-muted">Monthly thereafter</span>
            <span className="text-body">{formatZAR(result.recurring_amount)}</span>
          </div>
        )}
      </div>

      {result.parq_flag && (
        <p className="rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
          ⚠ Please bring a doctor’s medical clearance note before your first session.
        </p>
      )}

      <button className="btn-primary w-full" onClick={downloadPdf} disabled={pdfBusy}>
        {pdfBusy ? 'Preparing your card…' : 'Download Membership PDF'}
      </button>
      {pdfErr && <p className="text-sm text-error">{pdfErr}</p>}

      <div className="card text-left">
        <h3 className="font-display text-sm uppercase tracking-wider text-accent">What happens next</h3>
        <ul className="mt-2 space-y-1 text-sm text-muted">
          {paid ? (
            <li>1. ✅ Payment received — your membership is active.</li>
          ) : (
            <li>1. Complete your payment to activate your membership.</li>
          )}
          <li>2. You’ll receive a welcome email with your membership card (Phase 5).</li>
          <li>3. Show your verification code at reception on your first visit.</li>
        </ul>
      </div>
    </div>
  );
}
