// Generates "Yoyo GYM — Sales Playbook (New Sellers)" as a print-ready A4 PDF.
// Reusable: edit CONTENT below and re-run `node scripts/sales-playbook.js`.
// Output: ./Yoyo-GYM-Sales-Playbook.pdf (also synced via OneDrive).
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
const ensure = (h) => { if (y + h > BOTTOM) { doc.addPage(); y = M; } };
const gap = (h = 4) => { y += h; };

function h1(text) {
  ensure(16); gap(2);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); setColor(DARK);
  doc.text(text, M, y); y += 3;
  setFill(ACCENT); doc.rect(M, y, 26, 1.3, 'F'); y += 7;
}
function h2(text) {
  ensure(12); gap(2);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); setColor(ACCENT);
  doc.text(text, M, y); y += 6;
}
function para(text) {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); setColor(DARK);
  for (const ln of doc.splitTextToSize(text, CW)) { ensure(6); doc.text(ln, M, y); y += 5.4; }
}
function bullet(text, num) {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
  const marker = num != null ? `${num}.` : '•';
  const indent = num != null ? 8 : 6;
  const lines = doc.splitTextToSize(text, CW - indent);
  ensure(6);
  setColor(ACCENT); doc.setFont('helvetica', 'bold'); doc.text(marker, M + 1, y);
  doc.setFont('helvetica', 'normal'); setColor(DARK);
  lines.forEach((ln, i) => { if (i) { ensure(6); } doc.text(ln, M + indent, y); if (i < lines.length - 1) y += 5.4; });
  y += 5.4;
}
function callout(title, text) {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  const tLines = doc.splitTextToSize(text, CW - 10);
  const boxH = 8 + tLines.length * 5;
  ensure(boxH + 3);
  setFill(LIGHT); doc.rect(M, y, CW, boxH, 'F');
  setFill(ACCENT); doc.rect(M, y, 1.5, boxH, 'F');
  let ty = y + 6;
  doc.setFont('helvetica', 'bold'); setColor(ACCENT); doc.text(title, M + 5, ty); ty += 5;
  doc.setFont('helvetica', 'normal'); setColor(DARK);
  tLines.forEach((ln) => { doc.text(ln, M + 5, ty); ty += 5; });
  y += boxH + 4;
}
function script(title, text) {
  doc.setFont('helvetica', 'italic'); doc.setFontSize(10.5);
  const tLines = doc.splitTextToSize('"' + text + '"', CW - 12);
  const boxH = 9 + tLines.length * 5.2;
  ensure(boxH + 3);
  setFill([20, 20, 20]); doc.rect(M, y, CW, boxH, 'F');
  let ty = y + 6;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
  doc.text(title.toUpperCase(), M + 6, ty); ty += 5;
  doc.setFont('helvetica', 'italic'); doc.setFontSize(10.5); doc.setTextColor(235, 232, 226);
  tLines.forEach((ln) => { doc.text(ln, M + 6, ty); ty += 5.2; });
  y += boxH + 4;
}
function twoCol(rows, col1w = 60) {
  doc.setFontSize(9.5);
  for (const [k, v] of rows) {
    const vLines = doc.splitTextToSize(v, CW - col1w - 4);
    const rowH = Math.max(7, vLines.length * 5 + 2);
    ensure(rowH);
    setFill([252, 250, 250]); doc.rect(M, y - 4.5, CW, rowH, 'F');
    doc.setFont('helvetica', 'bold'); setColor(DARK); doc.text(k, M + 2, y);
    doc.setFont('helvetica', 'normal'); setColor([60, 60, 60]);
    vLines.forEach((ln, i) => doc.text(ln, M + col1w, y + i * 5));
    y += rowH;
  }
  gap(3);
}

// ---------------- COVER ----------------
setFill(DARK); doc.rect(0, 0, PW, PH, 'F');
setFill(ACCENT); doc.rect(0, 96, PW, 2, 'F');
doc.setFont('times', 'bold'); doc.setFontSize(13); setColor(ACCENT);
doc.text('MULESOO DIGITAL SOLUTIONS', M, 70);
doc.setFont('helvetica', 'bold'); doc.setFontSize(34); doc.setTextColor(245, 240, 232);
doc.text('Sales Playbook', M, 120);
doc.setFont('helvetica', 'normal'); doc.setFontSize(13); doc.setTextColor(180, 180, 180);
doc.text('For New Sellers — How to Win Gym Clients', M, 138);
doc.text('& Exactly What You Deliver', M, 146);
doc.setFontSize(10); setColor(GRAY);
doc.text('Premium AI Gym Membership & Booking Automation', M, 250);
doc.text('South Africa Market', M, 256);
doc.text(`Generated ${new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}`, M, 262);
doc.addPage(); y = M;

// ---------------- 1 MINDSET ----------------
h1('1. The Winning Mindset');
para('You are not selling software. You are selling outcomes a gym owner already wants: a full reception desk that works 24/7, never misses a lead, collects payments automatically, and keeps them legally compliant — for less than a week of a receptionist\'s wage.');
para('As a new seller with no track record, your job is to remove risk and prove value fast. You do that with a live demo, a low-risk first offer, and one happy reference gym.');
callout('Golden rule', 'Lead with the problem and the money. "How much time does your team lose on paperwork and chasing payments?" — then show how this removes it.');

// ---------------- 2 TARGET ----------------
h1('2. Who to Target First');
bullet('Independent gyms, boutique studios, CrossFit boxes, and personal-training facilities — they feel admin pain but have no big-corporate system.');
bullet('Owner-run gyms where you can speak to the decision-maker directly (no procurement department).');
bullet('Gyms still using paper forms, spreadsheets, or WhatsApp to manage members — your biggest, easiest wins.');
para('Avoid large franchises first — they usually have locked-in corporate systems. Win small, independent owners who can say yes today.');

// ---------------- 3 FIRST CLIENT ----------------
h1('3. How to Win Your First Client');
para('Your first sale is the hardest because you have no proof. Solve that with an anchor pilot:');
bullet('Offer 1–2 local gyms a discounted or free 14–30 day pilot in exchange for a testimonial, a case study, and referrals.', 1);
bullet('Set it up fully for them so they experience the finished product, not a promise.', 2);
bullet('After the pilot, convert them to a paying monthly plan and ask for 2–3 referrals while they\'re happy.', 3);
bullet('Use that reference gym in every future pitch — "Here\'s a gym near you already using it."', 4);
callout('Why this works', 'One real, local, happy gym destroys the "but does it actually work?" objection for every prospect after it.');

// ---------------- 4 PITCH ----------------
h1('4. The Sales Conversation');
para('Keep it short. Ask, show, offer. A simple flow:');
bullet('ASK about their pain: "Who handles new sign-ups and chasing monthly payments? How many hours a week is that?"');
bullet('SHOW the live demo on your phone (see section 6) — let them scan the QR and watch a member register in minutes.');
bullet('OFFER the low-risk start: a pilot or month-to-month plan they can cancel any time.');
script('Opening line', 'I help gyms replace paperwork and payment chasing with an automated system that signs members up, screens their health, takes payment, and books classes — all from a QR code on your door. Can I show you in two minutes?');
script('Closing line', 'Let\'s set it up for your gym free for two weeks. If it doesn\'t save you time, you walk away — no cost, no commitment.');

// ---------------- 5 OBJECTIONS & PRICING ----------------
h1('5. Pricing & Handling Objections');
para('Anchor the price against what it replaces, never in isolation:');
callout('Price anchor', 'A receptionist costs R8,000–R15,000/month. This does the admin 24/7 for a fraction of that. Present your monthly fee right after that comparison.');
h2('Common objections');
twoCol([
  ['"It\'s too expensive"', 'It costs less than a week of one staff member\'s wage and works 24/7, never takes leave, and reduces missed payments.'],
  ['"We already have a system"', 'Does it register a member at 10pm on a Sunday, screen their health, and take payment automatically? Let\'s run it free alongside yours for 2 weeks.'],
  ['"Is my members\' data safe?"', 'Yes. Each gym gets its own private, encrypted database, POPIA-aligned, with member consent captured at sign-up.'],
  ['"I\'m not tech-savvy"', 'Everything is set up and configured for you. You use one simple admin screen, and I train you and your staff.'],
  ['"What if it breaks?"', 'You\'re on a monthly plan that includes support and updates, and you can cancel any time.'],
  ['"Let me think about it"', 'Fair — let\'s start the free 2-week pilot so your decision is based on real results, not a guess.'],
], 52);

// ---------------- 6 DEMO ----------------
h1('6. The Demo That Closes');
para('Nothing sells this faster than the owner seeing it work. On your phone or laptop:');
bullet('Show your demo gym\'s QR code → scan it → walk through the member registration flow (health screening, plan choice, payment screen).');
bullet('Show the membership card / ID PDF the member receives instantly.');
bullet('Log into the admin dashboard → show check-in verification, the member list, and the revenue/analytics view.');
bullet('Show a class booking and an automatic email/notification.');
callout('Always have a demo ready', 'Keep one fully-configured demo gym instance live at all times. Practise the 2-minute walkthrough until it\'s smooth.');

// ---------------- 7 WHAT YOU DELIVER ----------------
h1('7. What You Deliver to the Client');
para('This is a service, not a once-off file. For each gym you deliver a complete, branded, hosted system plus the items to run it:');
bullet('Their own private, branded system — live at their web address (a subdomain or their own domain).');
bullet('Owner admin login to the dashboard.');
bullet('Their branding, membership plans and prices, add-ons, and gym rules configured in the system.');
bullet('Payments connected to the gym\'s own Paystack account; email/WhatsApp notifications connected.');
bullet('Two print-ready QR codes (new member + existing member).');
bullet('A training session (≈30 min) plus a 1-page how-to sheet.');
bullet('Ongoing hosting, updates, and support (your monthly subscription).');

// ---------------- 8 WHAT THE OWNER RECEIVES ----------------
h1('8. What the Gym Owner Actually Receives');
para('The product is a hosted web system — there is no app file to install. The tangible items you hand over are:');
twoCol([
  ['The live system', 'A web link / URL (their subdomain or domain). This IS the product — opened on any phone or computer, no installation.'],
  ['Admin login', 'A username + password for the /admin dashboard, delivered securely (not over open email).'],
  ['QR code files', 'Image/PDF files of their two QR codes, print-ready for the door, reception desk, flyers and social media. Optional: a printed poster.'],
  ['Handover pack (PDF)', 'A short document with their login, the system link, a how-to guide, what\'s included, and your support contact.'],
], 42);
callout('In short', 'You deliver a LINK + LOGIN + QR CODE FILES + a HANDOVER PDF. The "software" lives online and updates itself — the owner just uses it.');

// ---------------- 9 WHAT MEMBERS RECEIVE ----------------
h1('9. What Their Members Receive (Automatic)');
para('Once live, the system generates these for every member with no work from the gym:');
bullet('A premium membership card PDF + full registration confirmation document.');
bullet('A downloadable digital ID card with photo and personal QR code.');
bullet('A welcome email, payment receipts, and class/booking confirmations.');
bullet('A unique membership number and verification code for gym access.');

// ---------------- 10 AFTER THE SALE ----------------
h1('10. After the Sale — Keep & Grow');
bullet('Onboard within a few days; don\'t let momentum cool.');
bullet('Check in after week 1 to make sure they\'re using it and happy.');
bullet('After ~30 days, ask for a testimonial and 2–3 referrals.');
bullet('Upsell later: extra branding, additional locations, and the AI chatbot upgrade once enabled.');
callout('Compounding growth', 'Every happy gym becomes your reference and referral engine. Five happy gyms make the sixth, seventh and eighth almost sell themselves.');

// ---------------- FOOTERS ----------------
const pages = doc.getNumberOfPages();
for (let p = 2; p <= pages; p++) {
  doc.setPage(p);
  doc.setDrawColor(225, 225, 225); doc.setLineWidth(0.2);
  doc.line(M, PH - 14, PW - M, PH - 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setColor(GRAY);
  doc.text('Yoyo GYM — Sales Playbook  •  MuleSoo Digital Solutions', M, PH - 9);
  doc.text(`Page ${p - 1} of ${pages - 1}`, PW - M, PH - 9, { align: 'right' });
}

const out = 'Yoyo-GYM-Sales-Playbook.pdf';
writeFileSync(out, Buffer.from(doc.output('arraybuffer')));
console.log('✔ Wrote ' + out);
