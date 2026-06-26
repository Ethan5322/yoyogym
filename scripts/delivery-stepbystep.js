// Generates "Yoyo GYM — Step-by-Step Delivery Guide" (~20 pages, beginner
// friendly) as a print-ready A4 PDF. Reusable: edit CONTENT and re-run
//   node scripts/delivery-stepbystep.js
// Output: ./Yoyo-GYM-Delivery-Step-by-Step.pdf (also synced via OneDrive).
import { jsPDF } from 'jspdf';
import { writeFileSync } from 'node:fs';

const ACCENT = [230, 57, 70];
const DARK = [22, 22, 22];
const GRAY = [120, 120, 120];
const LIGHT = [245, 245, 245];
const GREEN = [0, 150, 70];

const doc = new jsPDF({ unit: 'mm', format: 'a4' });
const PW = 210, PH = 297, M = 18, CW = PW - M * 2;
const BOTTOM = PH - 20;
let y = M;

const setColor = (c) => doc.setTextColor(c[0], c[1], c[2]);
const setFill = (c) => doc.setFillColor(c[0], c[1], c[2]);
const ensure = (h) => { if (y + h > BOTTOM) { doc.addPage(); y = M; } };
const gap = (h = 4) => { y += h; };
const pageBreak = () => { doc.addPage(); y = M; };

function h1(text) {
  ensure(18); gap(1);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(17); setColor(DARK);
  for (const ln of doc.splitTextToSize(text, CW)) { doc.text(ln, M, y); y += 8; }
  setFill(ACCENT); doc.rect(M, y - 3, 26, 1.3, 'F'); y += 6;
}
function h2(text) {
  ensure(12); gap(2);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); setColor(ACCENT);
  for (const ln of doc.splitTextToSize(text, CW)) { doc.text(ln, M, y); y += 6; }
  gap(1);
}
function para(text) {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); setColor(DARK);
  for (const ln of doc.splitTextToSize(text, CW)) { ensure(6); doc.text(ln, M, y); y += 5.4; }
  gap(1.5);
}
function bullet(text, num) {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
  const marker = num != null ? `${num}.` : '•';
  const indent = num != null ? 8 : 6;
  const lines = doc.splitTextToSize(text, CW - indent);
  ensure(6);
  setColor(ACCENT); doc.setFont('helvetica', 'bold'); doc.text(marker, M + 1, y);
  doc.setFont('helvetica', 'normal'); setColor(DARK);
  lines.forEach((ln, i) => { if (i) ensure(6); doc.text(ln, M + indent, y); if (i < lines.length - 1) y += 5.4; });
  y += 5.4;
}
function callout(title, text, tone) {
  const col = tone === 'green' ? GREEN : ACCENT;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  const tLines = doc.splitTextToSize(text, CW - 10);
  const boxH = 8 + tLines.length * 5;
  ensure(boxH + 3);
  setFill(LIGHT); doc.rect(M, y, CW, boxH, 'F');
  setFill(col); doc.rect(M, y, 1.5, boxH, 'F');
  let ty = y + 6;
  doc.setFont('helvetica', 'bold'); setColor(col); doc.text(title, M + 5, ty); ty += 5;
  doc.setFont('helvetica', 'normal'); setColor(DARK);
  tLines.forEach((ln) => { doc.text(ln, M + 5, ty); ty += 5; });
  y += boxH + 4;
}
function twoCol(rows, col1w = 58) {
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
function stepBadge(n, title) {
  ensure(16);
  setFill(ACCENT); doc.roundedRect(M, y - 1, 9, 9, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(255, 255, 255);
  doc.text(String(n), M + 4.5, y + 5.2, { align: 'center' });
  doc.setFontSize(13); setColor(DARK);
  doc.text(title, M + 13, y + 5);
  y += 12;
}

// ===================== COVER (p1) =====================
setFill(DARK); doc.rect(0, 0, PW, PH, 'F');
setFill(ACCENT); doc.rect(0, 100, PW, 2, 'F');
doc.setFont('times', 'bold'); doc.setFontSize(13); setColor(ACCENT);
doc.text('MULESOO DIGITAL SOLUTIONS', M, 74);
doc.setFont('helvetica', 'bold'); doc.setFontSize(30); doc.setTextColor(245, 240, 232);
doc.text('Step-by-Step', M, 124);
doc.text('Delivery Guide', M, 139);
doc.setFont('helvetica', 'normal'); doc.setFontSize(13); doc.setTextColor(180, 180, 180);
doc.text('How to sell & set up the gym system', M, 156);
doc.text('for a new gym — beginner friendly', M, 164);
doc.setFontSize(10); setColor(GRAY);
doc.text('One master system  •  Many gyms  •  No coding experience needed', M, 250);
doc.text(`Generated ${new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}`, M, 256);

// ===================== CONTENTS (p2) =====================
pageBreak();
h1('Contents');
const toc = [
  ['1.', 'Welcome — what this guide is'],
  ['2.', 'The big picture: one system, many gyms'],
  ['3.', 'What changes per gym, what stays the same'],
  ['4.', 'What DELIVERY.md is and how it helps you'],
  ['5.', 'Accounts & tools you need (once)'],
  ['6.', 'Your "master" — keep the original safe'],
  ['7.', 'STEP 1 — Collect the gym\'s information'],
  ['8.', 'STEP 2 — Create the gym\'s database (Supabase)'],
  ['9.', 'STEP 3 — Load the schema & starter data'],
  ['10.', 'STEP 4 — Make a safe branch for this gym'],
  ['11.', 'STEP 5 — Brand the splash (name, tagline, logo, colour)'],
  ['12.', 'STEP 6 — Create the gym\'s website (Vercel)'],
  ['13.', 'STEP 7 — Add the environment variables'],
  ['14.', 'STEP 8 — Configure everything in Admin Settings'],
  ['15.', 'STEP 9 — QR codes, handover & training'],
  ['16.', 'STEP 10 — Test before you hand over'],
  ['17.', 'Selling to your 2nd, 3rd, 10th gym (the loop)'],
  ['18.', 'Your exact question, answered plainly'],
  ['19.', 'Updating all gyms + troubleshooting'],
  ['20.', 'Glossary of words you\'ll see'],
];
doc.setFontSize(11);
for (const [n, t] of toc) {
  ensure(7);
  doc.setFont('helvetica', 'bold'); setColor(ACCENT); doc.text(n, M, y);
  doc.setFont('helvetica', 'normal'); setColor(DARK); doc.text(t, M + 10, y);
  y += 7;
}

// ===================== 1. WELCOME (p3) =====================
pageBreak();
h1('1. Welcome — what this guide is');
para('This is your plain-English instruction manual for taking the gym system you already own and setting it up for a brand-new gym client. No coding experience is assumed. If you can follow a recipe, you can follow this.');
para('You will do the same short routine for every gym you sell to. The first time will feel slow. By your third gym it will take you about one to two hours from start to finish.');
callout('The one idea to remember', 'You have ONE master system. For each gym you make a private, isolated COPY of where its data and website live — you never rebuild the system and you never damage your original.');
para('Read sections 1–6 once to understand how it works. Sections 7–16 are the actual steps you repeat for each gym. Section 18 answers the exact question you asked.');

// ===================== 2. BIG PICTURE (p4) =====================
pageBreak();
h1('2. The big picture: one system, many gyms');
para('Think of your system like a master recipe. Every gym gets a meal cooked from the same recipe, but served on its own plate, with its own name on the menu.');
para('For each gym there are three separate things you set up:');
twoCol([
  ['1. A database (Supabase)', 'A private vault that stores THIS gym\'s members, payments, bookings. Each gym must have its own — their data never mixes with another gym\'s.'],
  ['2. A website (Vercel)', 'The actual link the gym and its members use. Each gym gets its own website address, built from your one codebase.'],
  ['3. The settings & branding', 'The gym\'s name, colours, plans, prices and contact details — mostly typed into the Admin Settings page, plus one tiny branding edit.'],
], 50);
callout('Why separate database + website per gym?', 'So Gym A can never see Gym B\'s members, and if one gym cancels you simply delete its database and website — the others are untouched. This is normal and expected.');

// ===================== 3. WHAT CHANGES (p5) =====================
pageBreak();
h1('3. What changes per gym, what stays the same');
h2('Stays the same (your master code — do NOT edit per gym)');
bullet('All the features: registration, health screening, payments, classes, check-in, admin dashboard, notifications.');
bullet('The way everything works. You improve this once, for everyone.');
h2('Changes per gym (set without touching the master)');
bullet('Gym name, tagline, contact details, operating hours — typed into Admin Settings.');
bullet('Membership plans, prices, add-ons, joining fees — typed into Admin Settings (Catalog).');
bullet('Legal text (indemnity, contract, POPIA), gym rules — typed into Admin Settings.');
bullet('Owner alert numbers (WhatsApp/Telegram/email) — typed into Admin Settings.');
bullet('Payment keys (the gym\'s own Paystack) — set as environment variables in Vercel.');
h2('The one small code touch per gym');
para('The splash/landing page name, tagline, logo and the main accent colour are not yet read from Settings. You change these in a SAFE per-gym branch (Step 4–5), so your master stays clean. This is the only code edit, and it is copy-paste simple.');

// ===================== 4. DELIVERY.MD (p6) =====================
pageBreak();
h1('4. What DELIVERY.md is and how it helps you');
para('DELIVERY.md is a short text file already inside your project. It is your technical cheat-sheet — the quick reference version of this guide. Open it any time in your code editor or on GitHub.');
h2('What it contains');
bullet('The exact deploy steps for Vercel and the list of environment variables to set.');
bullet('How the scheduled jobs (crons) run, and how to trigger them manually.');
bullet('A ready-made end-to-end TEST checklist (registration, member portal, admin).');
bullet('A POPIA compliance summary and a security summary you can show a client.');
bullet('A "known follow-ups" list so you always know what is and isn\'t built.');
callout('How to use it', 'This PDF teaches you the WHY and the full routine. DELIVERY.md is the fast WHAT — keep it open in a second window while you work through a gym, and tick off its test checklist before every handover.');
para('There is also db/README.md (how to create the database) and RECOVERY.md (how to restore everything if a computer is lost). Same idea: short, practical reference files.');

// ===================== 5. ACCOUNTS (p7) =====================
pageBreak();
h1('5. Accounts & tools you need (set up once)');
para('Before your first gym, get these ready. Most are free to start.');
twoCol([
  ['GitHub account', 'Holds your master code. You already have this (Ethan5322/yoyogym).'],
  ['Vercel account', 'Builds and hosts each gym\'s website. Free tier is fine to start.'],
  ['Supabase account', 'Hosts each gym\'s database. Free tier covers a small gym.'],
  ['A code editor', 'VS Code (free). Used only for the tiny branding edit.'],
  ['Node.js installed', 'Lets you run the seed commands. Install the LTS version.'],
  ['Git installed', 'Lets you make a safe per-gym branch.'],
], 44);
h2('For EACH gym you will also collect (from the gym owner)');
bullet('Their Paystack account API keys (so payments go to THEM, not you).');
bullet('Their Brevo email sender (for member emails) and owner WhatsApp number.');
bullet('Their logo image, brand colour, plans & prices, address and contact details.');
callout('Tip', 'Make a simple Google Form with all of the above. Send it to every new gym so you never chase missing details.');

// ===================== 6. MASTER SAFETY (p8) =====================
pageBreak();
h1('6. Your "master" — keep the original safe');
para('Your master is the "main" branch of your GitHub repo. Treat it like the original master tape: you copy from it, you do not scribble on it.');
h2('The golden rules');
bullet('Never make gym-specific edits directly on "main". Main stays generic and clean.');
bullet('For each gym, create a BRANCH (a safe parallel copy) named after the gym. You edit branding there.');
bullet('Each gym\'s Vercel website is connected to that gym\'s branch, so its branding only affects that gym.');
bullet('When you improve the system, you do it on main, then merge main into each gym\'s branch to update them.');
callout('Why a branch and not a full copy?', 'A branch keeps every gym linked to your one master, so improvements flow to all of them. A full separate copy would force you to update each gym by hand forever.');
para('Don\'t worry if "branch" and "merge" are new words — Step 4 shows the exact clicks/commands, and the Glossary (section 20) explains every term.');

// ===================== 7. STEP 1 INTAKE (p9) =====================
pageBreak();
h1('7. STEP 1 — Collect the gym\'s information');
stepBadge(1, 'Gather everything before you build');
para('Starting with all details in hand makes the rest fast. Collect:');
bullet('Gym name, tagline, logo file, brand colour (a hex code like #1E88E5).');
bullet('Address, phone, email, website, operating hours.');
bullet('Membership plans with prices, joining fees, add-ons (or use sensible defaults and adjust later).');
bullet('Their Paystack public & secret keys (from the gym\'s Paystack dashboard).');
bullet('Their Brevo API key + sender email; the owner\'s WhatsApp number (+27…).');
bullet('Who the owner login should belong to (their name + email).');
callout('No Paystack yet?', 'You can still deliver — online card payments simply stay off until they add keys. Staff can record cash/EFT payments in the admin in the meantime.');

// ===================== 8. STEP 2 SUPABASE (p10) =====================
pageBreak();
h1('8. STEP 2 — Create the gym\'s database (Supabase)');
stepBadge(2, 'Make a private vault for this gym\'s data');
bullet('Go to supabase.com and log in. Click "New Project".', 1);
bullet('Name it clearly, e.g. "powerfit-gym". Choose a region close to South Africa.', 2);
bullet('Set a strong database password and save it in your password manager.', 3);
bullet('Wait ~2 minutes for the project to finish setting up.', 4);
bullet('Open Project Settings → API. Copy two things: the Project URL and the service_role key.', 5);
callout('Keep the service_role key secret', 'It has full access to the database. It only ever goes into Vercel\'s environment variables (Step 7) — never into the code, never shared in chat or email.');
para('Each gym gets its own brand-new Supabase project. That is what keeps their members\' data completely separate from every other gym.');

// ===================== 9. STEP 3 SCHEMA (p11) =====================
pageBreak();
h1('9. STEP 3 — Load the schema & starter data');
stepBadge(3, 'Create the tables, then add starter plans');
h2('3a. Create the tables');
bullet('In Supabase, open the "SQL Editor" (left menu).', 1);
bullet('In your project, open the file db/schema.sql and copy ALL of it.', 2);
bullet('Paste it into the SQL Editor and click "Run". You should see success, no errors.', 3);
para('This builds all the tables (members, payments, classes, etc.) in one go. db/README.md explains this too.');
h2('3b. Add the owner login & starter catalogue');
para('On your computer, in the project folder, create a temporary .env file pointing at THIS gym\'s Supabase (URL + service_role key + a JWT secret), then run:');
bullet('npm run seed:owner   — creates the gym\'s owner admin login.', 1);
bullet('npm run seed:catalog — adds default membership plans & add-ons.', 2);
callout('Heads up', 'The owner username/email/password come from the SEED_OWNER_* lines in your .env. Set them to the gym owner\'s details (or a temporary password they change later).');

// ===================== 10. STEP 4 BRANCH (p12) =====================
pageBreak();
h1('10. STEP 4 — Make a safe branch for this gym');
stepBadge(4, 'Copy the master so you can brand safely');
para('This protects your original. In your project folder, open a terminal and run:');
bullet('git checkout main         — make sure you start from the clean master.', 1);
bullet('git pull                  — get the latest master.', 2);
bullet('git checkout -b gym-powerfit   — create + switch to this gym\'s branch.', 3);
para('You are now on the gym\'s branch. Anything you change here stays here and never touches "main".');
callout('Naming tip', 'Use "gym-" plus the gym\'s name, e.g. gym-powerfit, gym-ironworks. You\'ll connect this exact branch to the gym\'s Vercel site in Step 6.');
para('If terminals feel scary, VS Code has a "Source Control" panel with buttons for the same actions — and the Glossary explains each term.');

// ===================== 11. STEP 5 BRAND (p13) =====================
pageBreak();
h1('11. STEP 5 — Brand the splash (name, tagline, logo, colour)');
stepBadge(5, 'The only code edit — copy/paste simple');
para('On the gym\'s branch, open src/pages/Splash.jsx. Change just the text:');
bullet('Replace "Your Gym Name" with the gym\'s name.');
bullet('Replace "Train harder. Live stronger." with the gym\'s tagline.');
bullet('For the logo: put their logo file in the /public folder (e.g. logo.png) and swap the placeholder box for an image — or simply change the letter "G" to their initial for now.');
h2('Set the accent colour');
para('Open src/index.css and find the line that sets --accent (around the top). Change the hex value to the gym\'s brand colour, e.g. --accent: #1E88E5; for blue.');
callout('Save your work to the branch', 'After editing, run: git add -A then git commit -m "Brand for PowerFit" then git push -u origin gym-powerfit. This saves the branding onto the gym\'s branch only.');
para('That\'s the entire code touch. Everything else (plans, prices, legal, contacts) is done by typing in Admin Settings in Step 8 — no code.');

// ===================== 12. STEP 6 VERCEL (p14) =====================
pageBreak();
h1('12. STEP 6 — Create the gym\'s website (Vercel)');
stepBadge(6, 'Publish this gym\'s own website');
bullet('Go to vercel.com → "Add New… → Project".', 1);
bullet('Import your GitHub repo (the same yoyogym repo every time).', 2);
bullet('Under "Git Branch", choose this gym\'s branch (e.g. gym-powerfit), NOT main.', 3);
bullet('Framework preset: Vite. The build settings come from your vercel.json automatically.', 4);
bullet('Before deploying, add the environment variables (Step 7), then click Deploy.', 5);
callout('One repo, many websites', 'You import the SAME repo for every gym; the difference is the branch you pick and the environment variables you set. That\'s how one codebase powers many independent gym websites.');
para('After deploying, give the gym a friendly address — a subdomain like powerfit.yourbrand.co.za, or connect their own domain in Vercel → Settings → Domains.');

// ===================== 13. STEP 7 ENV (p15) =====================
pageBreak();
h1('13. STEP 7 — Add the environment variables');
stepBadge(7, 'Connect this website to this gym\'s services');
para('In the Vercel project → Settings → Environment Variables, add the values (use .env.example as your checklist). The important ones:');
twoCol([
  ['SUPABASE_URL', 'This gym\'s Supabase Project URL (Step 2).'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'This gym\'s service_role key (Step 2). Secret.'],
  ['SUPABASE_SCHEMA', 'gym'],
  ['JWT_SECRET', 'A long random string (unique per gym).'],
  ['PAYSTACK_SECRET_KEY / PUBLIC_KEY', 'The gym\'s own Paystack keys.'],
  ['BREVO_API_KEY / SENDER', 'For member emails.'],
  ['CALLMEBOT / OWNER_EMAIL', 'Owner alert contacts.'],
  ['CRON_SECRET', 'A random string to protect scheduled jobs.'],
], 64);
callout('Then redeploy', 'After adding variables, trigger a redeploy so they take effect. Confirm success by visiting https://THEIR-SITE/api/health — you should see {"status":"ok"}.');

// ===================== 14. STEP 8 SETTINGS (p16) =====================
pageBreak();
h1('14. STEP 8 — Configure everything in Admin Settings');
stepBadge(8, 'Type the gym\'s details — no code');
para('Open https://THEIR-SITE/admin/login and sign in with the owner account you seeded. Go to Settings and fill in each section, clicking Save on each:');
bullet('Gym Profile — name, tagline, accent colour, phone, email, address, hours, welcome message.');
bullet('Owner Notifications — WhatsApp/Telegram/email for instant alerts.');
bullet('Contract Discounts — discount % for longer contracts.');
bullet('Access & Compliance — capacity, session length, peak hours, plan rules.');
bullet('Gym Rules, Indemnity, Membership Contract, POPIA — review the defaults, edit, Save.');
para('Then open the Catalog page to adjust membership plans, prices, joining fees and add-ons to match what the gym sells.');
callout('Good news', 'The gym NAME you set here flows automatically into the registration flow, member emails and the PDF membership cards. Most of the branding is genuinely no-code.');

// ===================== 15. STEP 9 HANDOVER (p17) =====================
pageBreak();
h1('15. STEP 9 — QR codes, handover & training');
stepBadge(9, 'Give the gym what they actually use');
para('In the admin, open QR Codes and download the two print-ready codes:');
bullet('New Member QR → opens registration (/register).');
bullet('Existing Member QR → opens the member portal (/member).');
para('Hand the gym owner their "delivery pack":');
twoCol([
  ['The website link', 'Their live address — this IS the product (no app to install).'],
  ['Admin login', 'Username + password, shared securely (not plain email).'],
  ['QR code files', 'Print for the door, reception desk, flyers, social media.'],
  ['A short how-to', 'One page: how to verify members, add classes, see payments.'],
], 44);
callout('Train them live', 'A 30-minute call walking the owner through Verify, Members, Classes and Payments dramatically reduces support questions later.');

// ===================== 16. STEP 10 TEST (p18) =====================
pageBreak();
h1('16. STEP 10 — Test before you hand over');
stepBadge(10, 'Tick these off (also in DELIVERY.md)');
bullet('Open /register — the splash/flow shows the gym\'s name and a time-of-day greeting.');
bullet('Complete a test registration: personal info, PAR-Q, plan, agreement, success screen.');
bullet('Download the membership PDF — it shows the gym name and a QR code.');
bullet('If Paystack is set: do a test payment and confirm the member becomes active.');
bullet('Log into /admin — Dashboard loads; Verify a code shows a green "access granted".');
bullet('Members, Classes, Payments, Settings all open and save.');
bullet('Visit /api/health → {"status":"ok"}.');
callout('If something fails', 'Check the environment variables first (90% of issues), then re-run the relevant step. Section 19 has a troubleshooting list.');

// ===================== 17. THE LOOP (p19) =====================
pageBreak();
h1('17. Selling to your 2nd, 3rd, 10th gym (the loop)');
para('Every new gym is the SAME routine. You do not start over and you do not rebuild anything:');
bullet('Collect details (Step 1).', 1);
bullet('New Supabase project + run schema + seed (Steps 2–3).', 2);
bullet('New branch off main, named for the gym (Step 4).', 3);
bullet('Edit the splash name/tagline/logo + accent on that branch (Step 5).', 4);
bullet('New Vercel project from the same repo, pointed at the gym\'s branch (Step 6).', 5);
bullet('Add that gym\'s environment variables (Step 7).', 6);
bullet('Configure Settings + Catalog in the admin (Step 8).', 7);
bullet('QR codes, handover, train, test (Steps 9–10).', 8);
callout('It gets fast', 'By your third gym this is a ~1–2 hour checklist. Print Steps 7–16 and tick them off each time.');

// ===================== 18. YOUR QUESTION (p20) =====================
pageBreak();
h1('18. Your exact question, answered plainly');
para('You asked: "When I sell to another gym, do I need to ask Claude to change the name/logo of the original file, and create the SQL and Vercel project again? How do I do this for a different gym?"');
h2('Do I need to ask Claude each time? — No.');
para('Everything is a repeatable checklist you do yourself (Steps 1–10). You only need a developer/Claude for NEW features or fixes to the master — not for setting up a gym.');
h2('Do I edit the ORIGINAL Yoyo GYM files? — No.');
para('You never edit "main". You make a per-gym branch (Step 4) and do the tiny branding edit there, so your original stays clean and reusable forever.');
h2('Do I create a new database and Vercel project each time? — Yes.');
para('Each gym needs its own Supabase database and its own Vercel website so their data and site are separate. This is normal, expected, and takes ~30 minutes once you\'re used to it.');
h2('How is the name/logo/colour actually changed?');
bullet('Name, plans, prices, legal, contacts, hours → typed into Admin Settings (no code).');
bullet('Splash name/tagline/logo + accent colour → one small edit on the gym\'s branch (Step 5).');
callout('Want it to be 100% no-code?', 'There is an optional one-time upgrade that makes the splash, logo and accent colour load from Admin Settings too. After that, a new gym is purely: new database + new website + fill in Settings. Ask for the "dynamic branding" upgrade when you\'re ready.', 'green');

// ===================== 19. UPDATES + TROUBLESHOOT (p21) =====================
pageBreak();
h1('19. Updating all gyms + troubleshooting');
h2('Pushing an improvement to every gym');
bullet('Make the change on "main" and push it to GitHub.', 1);
bullet('For each gym branch: merge main into it (git checkout gym-x, then git merge main, then git push).', 2);
bullet('Vercel redeploys that gym automatically. Repeat per gym.', 3);
callout('Even easier later', 'Once you take the optional dynamic-branding upgrade, most gyms can run straight off "main" with no per-gym branch — then a single push updates everyone at once.');
h2('Common problems & quick fixes');
twoCol([
  ['Site loads but data errors', 'Check SUPABASE_URL / service_role key in Vercel; redeploy.'],
  ['Can\'t log into admin', 'Re-run npm run seed:owner against THIS gym\'s database.'],
  ['Payments not working', 'Paystack keys missing/incorrect in Vercel env vars.'],
  ['Emails not sending', 'Set BREVO_API_KEY and a verified sender email.'],
  ['/api/health not ok', 'A required env var is missing — compare with .env.example.'],
], 56);

// ===================== 20. GLOSSARY (p22) =====================
pageBreak();
h1('20. Glossary of words you\'ll see');
twoCol([
  ['Repository (repo)', 'The folder of your code stored on GitHub.'],
  ['Branch', 'A safe parallel copy of the code where you can make changes without affecting the master ("main").'],
  ['main', 'Your master branch — the clean original.'],
  ['Merge', 'Bringing changes from one branch into another (e.g. main → a gym branch).'],
  ['Commit', 'Saving a snapshot of your changes with a short message.'],
  ['Push', 'Uploading your commits to GitHub.'],
  ['Deploy', 'Publishing the website so people can use it (Vercel does this).'],
  ['Environment variable', 'A secret setting (keys, URLs) stored in Vercel, not in the code.'],
  ['Supabase', 'The database service — one project per gym.'],
  ['Schema', 'The structure of the database (the tables) — created by db/schema.sql.'],
  ['Seed', 'Adding starter data (owner login, default plans).'],
  ['Service role key', 'A powerful secret database key — keep it private.'],
  ['Subdomain', 'A branded address like powerfit.yourbrand.co.za.'],
  ['Admin Settings', 'The no-code page where you type each gym\'s details.'],
], 46);
callout('You\'ve got this', 'Follow the steps in order, keep DELIVERY.md open beside you, and tick off the Step 10 test list before every handover. Each gym gets faster.', 'green');

// ===================== FOOTERS =====================
const pages = doc.getNumberOfPages();
for (let p = 2; p <= pages; p++) {
  doc.setPage(p);
  doc.setDrawColor(225, 225, 225); doc.setLineWidth(0.2);
  doc.line(M, PH - 14, PW - M, PH - 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setColor(GRAY);
  doc.text('Yoyo GYM — Step-by-Step Delivery Guide  •  MuleSoo Digital Solutions', M, PH - 9);
  doc.text(`Page ${p} of ${pages}`, PW - M, PH - 9, { align: 'right' });
}

const out = 'Yoyo-GYM-Delivery-Step-by-Step.pdf';
writeFileSync(out, Buffer.from(doc.output('arraybuffer')));
console.log('✔ Wrote ' + out + ' (' + pages + ' pages)');
