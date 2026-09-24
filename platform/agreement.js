// The Gym Owner Agreement, the owner's ID, and the PDF they keep.
//
// Asked for by the user: when a new owner activates, they should come away
// with an ID and a PDF of what they agreed to, like any serious service.
//
// ============================================================================
// Written from the code, and a draft until someone approves it
// ============================================================================
//
// Every commercial fact below is read from the constants the system actually
// runs on (TRIAL_DAYS, GRACE_DAYS, PURGE_AFTER_SUSPENDED_DAYS), so the
// document cannot promise what the code does not do. It is still a legal
// document: like the privacy policy it is marked DRAFT until
// PLATFORM_TERMS_APPROVED=true, and it should be reviewed before then.
//
// Acceptance is recorded in the audit log with the version the owner saw —
// the evidence, if it is ever needed, of what was agreed and when.
import { TRIAL_DAYS, GRACE_DAYS, PURGE_AFTER_SUSPENDED_DAYS } from './billing.js';

/** Bump when the terms change; stored with every acceptance. */
export const AGREEMENT_VERSION = '2026-09-24';

export const OPERATOR = 'MuleSoo Digital Solutions';

/**
 * A gym owner's permanent reference. Derived from their account, so it needs
 * no storage and can never change: "YG-OWN-" and the first 8 characters of
 * the account id, upper case.
 */
export function ownerId(userId) {
  const hex = String(userId || '').replace(/[^0-9a-f]/gi, '').slice(0, 8).toUpperCase();
  return hex.length === 8 ? `YG-OWN-${hex}` : null;
}

export const termsApproved = (env = process.env) => env.PLATFORM_TERMS_APPROVED === 'true';

/** The terms, as sections. The same text on the web page and in the PDF. */
export function agreementTerms() {
  return [
    {
      heading: '1. The parties',
      body:
        `This agreement is between you, the gym owner named above, and ${OPERATOR}, which operates Yoyo Gyms. ` +
        'By activating your account you confirm you are authorised to act for the gym.',
    },
    {
      heading: '2. The service',
      body:
        'Yoyo Gyms gives your gym its own admin panel for members, check-ins, payments and, depending on your plan, ' +
        'classes, trainers and face recognition; a listing members can find in the app and on the web; and member ' +
        "sign-up and sign-in. Each gym's records are kept separate from every other gym's.",
    },
    {
      heading: '3. Trial and billing',
      body:
        `Your gym starts with a ${TRIAL_DAYS}-day free trial. After it, your plan is billed monthly in advance, by card, ` +
        'through Paystack. We never see or store your card number — only a token that lets the same amount be taken ' +
        'each month, and the card type and last four digits so you can recognise it. Prices are shown on your owner page ' +
        'and can change with notice.',
    },
    {
      heading: '4. If a payment fails',
      body:
        `If a payment fails you have ${GRACE_DAYS} days' grace to pay. After that the gym is suspended: members and staff ` +
        'cannot sign in until it is paid. Nothing is deleted by a suspension, and paying reopens the gym.',
    },
    {
      heading: '5. Your members\' information',
      body:
        'Your gym is responsible for the information it collects about its members, and for having a lawful reason ' +
        '(such as their consent) to collect it — including health answers and, if you use it, face data. We store and ' +
        "process it only to run your gym's system, never sell it, and never show one gym's data to another. Where POPIA " +
        'applies, you are the responsible party and we are your operator.',
    },
    {
      heading: '6. Your plan',
      body:
        'Your plan sets how many active members you can have and which features you can use. Moving to a smaller plan ' +
        'never deletes members; it only stops new ones being added over the limit.',
    },
    {
      heading: '7. Closing your account',
      body:
        'You can ask to close your account at any time from your owner page. We confirm with you, close the gym to ' +
        `members and switch off your sign-in. Its data is kept for ${PURGE_AFTER_SUSPENDED_DAYS} days in case you change your ` +
        'mind, then deleted once we have confirmed it with you. Download anything you want to keep first.',
    },
    {
      heading: '8. Changes',
      body:
        'If these terms change, we tell you before the change applies. The version you accepted is recorded with the ' +
        'date you accepted it.',
    },
  ];
}

// ---------------------------------------------------------------------------
// The PDF
// ---------------------------------------------------------------------------

/**
 * Build the owner's agreement as a PDF.
 *
 * @param {object} d
 * @param {string} d.ownerId, d.ownerName, d.ownerEmail
 * @param {string} d.gymName, d.gymAddress, d.gymUsername, d.planLabel, d.priceText
 * @param {string|null} d.trialEndsAt  ISO date
 * @param {string|null} d.acceptedAt   ISO date of acceptance, from the audit log
 * @param {string|null} d.acceptedVersion
 * @param {boolean} d.approved         PLATFORM_TERMS_APPROVED
 * @returns {Promise<Buffer>}
 */
export async function agreementPdf(d) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 56; // margin
  let y = M;

  const line = (text, { size = 10, bold = false, colour = [20, 24, 26], gap = 4 } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...colour);
    for (const part of doc.splitTextToSize(String(text ?? ''), W - M * 2)) {
      if (y > H - M) { doc.addPage(); y = M; }
      doc.text(part, M, y);
      y += size * 1.35;
    }
    y += gap;
  };
  const date = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');

  // Header band in the brand red.
  doc.setFillColor(230, 57, 70);
  doc.rect(0, 0, W, 6, 'F');

  if (!d.approved) line('DRAFT — under review, not yet in force', { size: 10, bold: true, colour: [140, 47, 34] });
  line('Yoyo Gyms — Gym Owner Agreement', { size: 18, bold: true, gap: 2 });
  line(`Version ${AGREEMENT_VERSION} · ${OPERATOR}`, { size: 9, colour: [91, 106, 109], gap: 16 });

  // The owner's details, as a small table.
  const rows = [
    ['Owner ID', d.ownerId],
    ['Owner', [d.ownerName, d.ownerEmail].filter(Boolean).join(' · ')],
    ['Gym', d.gymName],
    ['Gym admin panel', d.gymAddress],
    ['Gym admin username', d.gymUsername],
    ['Plan', [d.planLabel, d.priceText].filter(Boolean).join(' · ')],
    ['Free trial ends', date(d.trialEndsAt)],
    ['Accepted', d.acceptedAt ? `${date(d.acceptedAt)} (version ${d.acceptedVersion || AGREEMENT_VERSION})` : 'On activation'],
  ];
  for (const [k, v] of rows) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(91, 106, 109);
    doc.text(k, M, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(20, 24, 26);
    doc.text(doc.splitTextToSize(String(v || '—'), W - M * 2 - 150), M + 150, y);
    y += 18;
  }
  y += 12;

  for (const s of agreementTerms()) {
    line(s.heading, { size: 12, bold: true, gap: 2 });
    line(s.body, { size: 10, gap: 10 });
  }

  line('Accepted electronically by the owner when activating their account. The acceptance, with its date and version, is kept in the Yoyo Gyms audit log.', { size: 8, colour: [91, 106, 109] });

  return Buffer.from(doc.output('arraybuffer'));
}
