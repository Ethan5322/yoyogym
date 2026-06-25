// Generates "Yoyo GYM — Business Master Guide" as a print-ready A4 PDF.
// Reusable: edit the CONTENT below and re-run `node scripts/business-guide.js`.
// Output: ./Yoyo-GYM-Business-Master-Guide.pdf (also synced via OneDrive).
import { jsPDF } from 'jspdf';
import { writeFileSync } from 'node:fs';

const ACCENT = [230, 57, 70];   // brand red #E63946
const DARK = [22, 22, 22];
const GRAY = [120, 120, 120];
const LIGHT = [245, 245, 245];

const doc = new jsPDF({ unit: 'mm', format: 'a4' });
const PW = 210, PH = 297, M = 18, CW = PW - M * 2;
const BOTTOM = PH - 20;
let y = M;

const setColor = (c) => doc.setTextColor(c[0], c[1], c[2]);
const setFill = (c) => doc.setFillColor(c[0], c[1], c[2]);

function ensure(h) {
  if (y + h > BOTTOM) { doc.addPage(); y = M; }
}
function gap(h = 4) { y += h; }

function h1(text) {
  ensure(16);
  gap(2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  setColor(DARK);
  doc.text(text, M, y);
  y += 3;
  setFill(ACCENT);
  doc.rect(M, y, 26, 1.3, 'F');
  y += 7;
}
function h2(text) {
  ensure(12);
  gap(2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  setColor(ACCENT);
  doc.text(text, M, y);
  y += 6;
}
function para(text) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  setColor(DARK);
  const lines = doc.splitTextToSize(text, CW);
  for (const ln of lines) { ensure(6); doc.text(ln, M, y); y += 5.4; }
}
function bullet(text, num) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  const marker = num != null ? `${num}.` : '•';
  const indent = num != null ? 8 : 6;
  const lines = doc.splitTextToSize(text, CW - indent);
  ensure(6);
  setColor(ACCENT);
  doc.setFont('helvetica', 'bold');
  doc.text(marker, M + 1, y);
  doc.setFont('helvetica', 'normal');
  setColor(DARK);
  lines.forEach((ln, i) => { if (i) ensure(6); doc.text(ln, M + indent, y); if (i < lines.length - 1) y += 5.4; });
  y += 5.4;
}
function callout(title, text) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const inner = CW - 10;
  const tLines = doc.splitTextToSize(text, inner);
  const boxH = 8 + tLines.length * 5;
  ensure(boxH + 3);
  setFill(LIGHT);
  doc.rect(M, y, CW, boxH, 'F');
  setFill(ACCENT);
  doc.rect(M, y, 1.5, boxH, 'F');
  let ty = y + 6;
  doc.setFont('helvetica', 'bold'); setColor(ACCENT);
  doc.text(title, M + 5, ty); ty += 5;
  doc.setFont('helvetica', 'normal'); setColor(DARK);
  tLines.forEach((ln) => { doc.text(ln, M + 5, ty); ty += 5; });
  y += boxH + 4;
}
function tableRows(rows, col1w = 55) {
  doc.setFontSize(9.5);
  for (const [k, v] of rows) {
    const vLines = doc.splitTextToSize(v, CW - col1w - 4);
    const rowH = Math.max(7, vLines.length * 5 + 2);
    ensure(rowH);
    setFill([252, 250, 250]);
    doc.rect(M, y - 4.5, CW, rowH, 'F');
    doc.setFont('helvetica', 'bold'); setColor(DARK);
    doc.text(k, M + 2, y);
    doc.setFont('helvetica', 'normal'); setColor([60, 60, 60]);
    vLines.forEach((ln, i) => doc.text(ln, M + col1w, y + i * 5));
    y += rowH;
  }
  gap(3);
}

// ---------------- COVER ----------------
setFill(DARK);
doc.rect(0, 0, PW, PH, 'F');
setFill(ACCENT);
doc.rect(0, 96, PW, 2, 'F');
doc.setFont('times', 'bold');
doc.setFontSize(13);
setColor(ACCENT);
doc.text('MULESOO DIGITAL SOLUTIONS', M, 70);
doc.setFont('helvetica', 'bold');
doc.setFontSize(34);
doc.setTextColor(245, 240, 232);
doc.text('Business', M, 120);
doc.text('Master Guide', M, 135);
doc.setFont('helvetica', 'normal');
doc.setFontSize(13);
doc.setTextColor(180, 180, 180);
doc.text('Selling & Delivering the AI Gym System', M, 150);
doc.text('to Multiple Gyms', M, 158);
doc.setFontSize(10);
setColor(GRAY);
doc.text('Premium AI Gym Membership & Booking Automation', M, 250);
doc.text('South Africa Market  •  CPA / POPIA aware', M, 256);
doc.text(`Generated ${new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}`, M, 262);

doc.addPage(); y = M;

// ---------------- 1. MODEL ----------------
h1('1. How You Sell This — The Model');
para('Your system is single-tenant: one Supabase database + one Vercel deployment per gym. You are not building one website that many gyms log into — you stamp out a private, isolated copy for each gym from one master codebase. Each gym\'s data never mixes with another\'s.');
para('This is the ideal model for selling, because you already have the tools to spin up a new gym fast: db/schema.sql, the seed scripts (seed:owner, seed:catalog), and an admin Settings panel for branding and pricing — no code editing per gym.');
callout('Core principle', 'Build once. Deploy many. Maintain centrally. One bug fix or new feature pushed to GitHub redeploys every gym automatically.');

// ---------------- 2. PRICING ----------------
h1('2. Pricing Strategy');
h2('Choose a recurring model');
tableRows([
  ['Monthly subscription (recommended)', 'You keep ownership of the code, host an instance per gym, and charge R750–R2,500/month each. You push updates to all gyms centrally.'],
  ['One-time license', 'Sell a copy for a setup fee (R15k–R40k); they own it; you bill support separately. Quick cash, but no recurring income and less control.'],
], 60);
para('Go with subscription. The ROI story sells itself: the system replaces a R8,000–R15,000/month receptionist, so R1,500/month is an easy yes for a gym owner. Twenty gyms at R1,500 is R30,000/month recurring from a single codebase.');
callout('Suggested package', 'Once-off onboarding/setup fee (e.g. R3,500) + monthly subscription (e.g. R1,500) that bundles hosting, updates and support.');

// ---------------- 3. MONEY & DATA ----------------
h1('3. Money & Data Ownership (Critical for SA)');
para('For each gym, set these up under the GYM\'S OWN accounts, not yours:');
bullet('Paystack — the gym\'s own account. Member payments must flow to them. You only paste their API keys into their instance, so you never handle their members\' money or carry financial liability.');
bullet('Supabase — ideally the gym\'s own project for clean data isolation and POPIA. You can manage it on their behalf.');
bullet('POPIA — the gym is the "responsible party" for member data; you are the operator/processor. Include a one-page data-processing clause in your contract.');
para('What you keep and control: the GitHub codebase, the deployment process, and (once added) a single Anthropic AI key.');

// ---------------- 4. HOSTING ----------------
h1('4. Hosting & Costs');
para('Bundle Supabase + Vercel + (later) Anthropic into your monthly fee. Both Supabase and Vercel have free tiers that cover a small gym; upgrade only busy gyms and pass that cost through. The gym sees one simple monthly fee — "everything included".');

// ---------------- 5. DELIVERY RUNBOOK ----------------
h1('5. Per-Buyer Delivery Runbook (~1–2 hrs)');
para('Run this every time you land a buyer. Most of it already exists in your DELIVERY.md.');
bullet('Collect from the gym: logo, brand colour, address/contact, operating hours, their plans & prices, their Paystack keys, Brevo sender email, owner WhatsApp number.', 1);
bullet('Database: create a new Supabase project → run db/schema.sql in the SQL Editor → run "npm run seed:owner" and "npm run seed:catalog".', 2);
bullet('Deploy: Vercel → New Project → import your GitHub repo → set environment variables (from .env.example) → Deploy. One repo, many Vercel projects.', 3);
bullet('Domain: give them a subdomain (theirgym.yourbrand.co.za) or connect their own domain.', 4);
bullet('Configure in-app: log into /admin → Settings → gym profile, branding, plans, notification numbers. No code needed.', 5);
bullet('QR codes: Admin → QR Codes → download and print their two codes (new member + existing member).', 6);
bullet('Handover: give the owner their /admin login, a 30-minute training call, and a 1-page how-to sheet.', 7);
bullet('Verify: open https://theirdomain/api/health → {"status":"ok"} and run the test checklist in DELIVERY.md.', 8);

// ---------------- 6. PRE-SALE ----------------
h1('6. Set Up Before Your First Sale');
bullet('A simple contract/SLA: what\'s included, monthly fee, uptime expectation, support hours, POPIA data clause, cancellation terms.');
bullet('An onboarding intake form (a Google Form is fine) that collects everything in step 1 above.');
bullet('A support channel (WhatsApp/email) with clear response-time expectations.');
bullet('Migrations discipline: when you change the database, add numbered migration files in db/ so you can safely update every existing gym.');
callout('Marketing honesty', 'Until you add the Anthropic key, market it as a "smart guided registration & booking system", not an "AI chatbot" — the conversation is currently rule-based. Add the key, upgrade everyone, then sell the AI angle.');

// ---------------- 7. MAINTAIN ----------------
h1('7. One Codebase, Many Gyms');
para('Fix a bug or add a feature once → push to GitHub main → every gym\'s Vercel redeploys automatically. That is the entire advantage of the single-tenant-from-one-repo model: build once, deploy many, maintain centrally.');

// ---------------- 8. CHECKLIST ----------------
h1('8. Quick Launch Checklist');
const checks = [
  'Decide pricing (recurring subscription recommended)',
  'Prepare contract/SLA + POPIA data clause',
  'Create onboarding intake form',
  'Set up your support channel',
  'Confirm your GitHub repo is the single source of truth',
  'Per gym: their Paystack + Supabase + Brevo accounts',
  'Per gym: deploy, configure Settings, generate QR codes',
  'Per gym: train the owner + hand over /admin login',
  'Per gym: verify /api/health and run the test checklist',
];
for (const c of checks) {
  ensure(7);
  doc.setDrawColor(ACCENT[0], ACCENT[1], ACCENT[2]);
  doc.setLineWidth(0.4);
  doc.rect(M, y - 3.5, 4, 4);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); setColor(DARK);
  doc.text(c, M + 7, y);
  y += 7;
}

// ---------------- FOOTERS ----------------
const pages = doc.getNumberOfPages();
for (let p = 2; p <= pages; p++) {
  doc.setPage(p);
  doc.setDrawColor(225, 225, 225); doc.setLineWidth(0.2);
  doc.line(M, PH - 14, PW - M, PH - 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setColor(GRAY);
  doc.text('Yoyo GYM — Business Master Guide  •  MuleSoo Digital Solutions', M, PH - 9);
  doc.text(`Page ${p - 1} of ${pages - 1}`, PW - M, PH - 9, { align: 'right' });
}

const out = 'Yoyo-GYM-Business-Master-Guide.pdf';
writeFileSync(out, Buffer.from(doc.output('arraybuffer')));
console.log('✔ Wrote ' + out);
