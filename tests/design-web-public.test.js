// The design critique of 2026-09-29, on the public website (agent "web-public"):
//   1. step 1 of the application is a form; the pitch is on the front page
//   2. ONE owner sign-in door, which routes by what the account can reach
//   3. system words replaced by people's words (country, plan, "My gym")
//   4. one type scale outside the panel
//   5. one lime button per page; the owner's next step is the primary one
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.PLATFORM_JWT_SECRET ||= 'test-only-signing-key-not-used-anywhere';

import { handlePlatform } from '../platform/router.js';
import { INVALID, LOCKED } from '../platform/login.js';
import { EVERY_PLAN_INCLUDES, SUPPORT_BY_PLAN, ownerFacingPlan, PLANS } from '../platform/plans.js';
import {
  signupPage,
  welcomePage,
  loginPage,
  ownerDashboardPage,
  applyDocumentsPage,
  problemPage,
  finderPage,
  layout,
} from '../platform/views.js';

// ---------------------------------------------------------------------------
// Harness (the pattern of tests/platform-owner-login.test.js)
// ---------------------------------------------------------------------------

function req({ method = 'POST', url = '/platform/login', body = '' } = {}) {
  const r = { method, url, headers: { 'content-type': 'application/x-www-form-urlencoded' }, _body: body };
  r[Symbol.asyncIterator] = async function* () {
    if (r._body) yield Buffer.from(r._body);
  };
  return r;
}

function res() {
  return {
    statusCode: 200, headers: {}, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    writeHead(code, h) {
      this.statusCode = code;
      for (const [k, v] of Object.entries(h || {})) this.headers[k.toLowerCase()] = v;
      return this;
    },
    end(b) { this.body = b || ''; return this; },
  };
}

function deps(user, log = { saved: [], audit: [] }) {
  return {
    findUserByEmail: async (email) => (user && email === user.email ? user : null),
    verifyPassword: async (plain) => plain === 'correct-horse',
    saveLoginState: async (id, patch) => log.saved.push({ id, ...patch }),
    verifySecondFactor: async (u, code) => Boolean(u?.totp_enabled) && code === '123456',
    audit: async (entry) => log.audit.push(entry),
  };
}

const APPLICANT = { id: 'o1', email: 'ann@bos.co', password_hash: 'h', kind: 'gym_owner', totp_enabled: false, failed_logins: 0 };
const STAFF = { id: 's1', email: 'me@yoyogyms.com', password_hash: 'h', kind: 'platform_staff', totp_enabled: true };

const form = (fields) => new URLSearchParams(fields).toString();
const ownerPost = (fields) => req({ body: form({ as: 'owner', totp: '', ...fields }) });

// ---------------------------------------------------------------------------
// 2. ONE OWNER DOOR
// ---------------------------------------------------------------------------

test('OLD OWNER LINKS (?as=owner) LAND ON THE ONE OWNER DOOR, still meaning the account page', async () => {
  const r = res();
  await handlePlatform(req({ method: 'GET', url: '/platform/login?as=owner' }), r, deps(null));
  assert.equal(r.statusCode, 302);
  assert.equal(r.headers.location, '/owner/login?next=account');

  const app = res();
  await handlePlatform(
    req({ method: 'GET', url: '/platform/login?as=owner&app=1&back=' + encodeURIComponent('https://localhost/?home=1') }),
    app,
    deps(null)
  );
  assert.equal(app.headers.location, '/owner/login?next=account&app=1&back=' + encodeURIComponent('https://localhost/?home=1'));
});

test('an applicant whose gym is not open yet lands on /platform/my-gym, signed in', async () => {
  const r = res();
  await handlePlatform(ownerPost({ email: 'ann@bos.co', password: 'correct-horse' }), r, deps(APPLICANT));
  assert.equal(r.statusCode, 302);
  assert.equal(r.headers.location, '/platform/my-gym');
  assert.match(String(r.getHeader('set-cookie')), /HttpOnly/i);
});

test('A WRONG PASSWORD AND AN UNKNOWN EMAIL COME BACK TO /owner/login WITH THE SAME ONE CODE', async () => {
  const log = { saved: [], audit: [] };
  const wrong = res();
  await handlePlatform(ownerPost({ email: 'ann@bos.co', password: 'nope' }), wrong, deps(APPLICANT, log));
  const unknown = res();
  await handlePlatform(ownerPost({ email: 'nobody@bos.co', password: 'nope' }), unknown, deps(APPLICANT, log));

  for (const r of [wrong, unknown]) {
    assert.equal(r.statusCode, 302);
    assert.equal(r.headers.location, '/owner/login?error=invalid', 'one code, whatever went wrong');
    assert.ok(!r.getHeader('set-cookie'));
    assert.ok(!/ann@bos|nope/.test(r.headers.location), 'nothing typed travels in the address');
  }
  // The lockout rule is untouched: the wrong password was counted on the account.
  assert.deepEqual(log.saved, [{ id: 'o1', failed_logins: 1 }]);
  assert.deepEqual(log.audit.map((a) => a.action), ['platform.login.failed', 'platform.login.failed']);
});

test('the owner door keeps the lock, and a correct password during the lock is still refused', async () => {
  const locked = { ...APPLICANT, locked_until: new Date(Date.now() + 600_000).toISOString() };
  const r = res();
  await handlePlatform(ownerPost({ email: 'ann@bos.co', password: 'correct-horse' }), r, deps(locked));
  assert.equal(r.headers.location, '/owner/login?error=locked');
  assert.ok(!r.getHeader('set-cookie'));
});

test('an owner who set up a code still needs it at the owner door (D-119)', async () => {
  const r = res();
  await handlePlatform(ownerPost({ email: 'ann@bos.co', password: 'correct-horse' }), r, deps({ ...APPLICANT, totp_enabled: true }));
  assert.equal(r.headers.location, '/owner/login?error=invalid');
  const ok = res();
  await handlePlatform(ownerPost({ email: 'ann@bos.co', password: 'correct-horse', totp: '123456' }), ok, deps({ ...APPLICANT, totp_enabled: true }));
  assert.equal(ok.headers.location, '/platform/my-gym');
});

test('asking for the account page keeps asking for it after a refusal', async () => {
  const r = res();
  await handlePlatform(ownerPost({ email: 'ann@bos.co', password: 'nope', next: 'account' }), r, deps(APPLICANT));
  assert.equal(r.headers.location, '/owner/login?error=invalid&next=account');
});

test('STAFF WITHOUT 2FA ARE STILL REFUSED AT THE OWNER DOOR — the rule is login.js, not the page', async () => {
  const r = res();
  await handlePlatform(ownerPost({ email: 'me@yoyogyms.com', password: 'correct-horse' }), r, deps({ ...STAFF, totp_enabled: false }));
  assert.equal(r.headers.location, '/owner/login?error=needs2fa');
  assert.ok(!r.getHeader('set-cookie'));
});

test('THE STAFF SIGN-IN IS UNCHANGED: its own page, its own refusals, 2FA required', async () => {
  const page = res();
  await handlePlatform(req({ method: 'GET', url: '/platform/login' }), page, deps(null));
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /Platform administrator login/);
  assert.match(page.body, /name="totp"/);
  assert.doesNotMatch(page.body, /name="as"/);

  const wrong = res();
  await handlePlatform(req({ body: form({ email: 'me@yoyogyms.com', password: 'nope', totp: '123456' }) }), wrong, deps(STAFF));
  assert.equal(wrong.statusCode, 200, 'a staff refusal is drawn on the staff page, as before');
  assert.ok(wrong.body.includes(INVALID));

  const no2fa = res();
  await handlePlatform(req({ body: form({ email: 'me@yoyogyms.com', password: 'correct-horse', totp: '' }) }), no2fa, deps({ ...STAFF, totp_enabled: false }));
  assert.equal(no2fa.statusCode, 200);
  assert.match(no2fa.body, /two-factor authentication/);
  assert.ok(!no2fa.getHeader('set-cookie'));

  const ok = res();
  await handlePlatform(req({ body: form({ email: 'me@yoyogyms.com', password: 'correct-horse', totp: '123456' }) }), ok, deps(STAFF));
  assert.equal(ok.headers.location, '/platform/home');
});

test('a signed-out visit to an owner page goes to the owner door, not the staff sign-in', async () => {
  for (const url of ['/platform/my-gym', '/platform/apply/documents', '/platform/apply/review']) {
    const r = res();
    await handlePlatform(req({ method: 'GET', url }), r, deps(null));
    assert.equal(r.headers.location, '/owner/login?next=account', url);
  }
});

test('THE OWNER DOOR TRIES THE GYM FIRST, then hands the same form on — and says one thing', () => {
  const page = readFileSync(new URL('../src/pages/OwnerLogin.jsx', import.meta.url), 'utf8');
  // 1. the gym: a gym owner lands in their gym's admin panel, as before
  assert.match(page, /fetch\('\/api\/auth\/owner-login'/);
  assert.match(page, /localStorage\.setItem\(tokenKey\(ADMIN_TOKEN, data\.gym\.slug\), data\.token\)/);
  assert.match(page, /openGym\(data\.gym\.slug, app\)/);
  // 2. only when NO gym took it, the real form goes to the owner account
  assert.match(page, /method="post"\s+action="\/platform\/login"/);
  assert.match(page, /<input type="hidden" name="as" value="owner" \/>/);
  assert.match(page, /if \(res\.status === 401 && data\.error === NO_GYM_TOOK_IT\)/);
  // …and that sentence is exactly the gym side's generic refusal
  const server = readFileSync(new URL('../server/handlers/auth/owner-login.js', import.meta.url), 'utf8');
  const serverInvalid = /const INVALID = '([^']+)'/.exec(server)[1];
  assert.match(page, new RegExp(`const NO_GYM_TOOK_IT = '${serverInvalid}'`));
  // 3. the owner account's refusals, word for word, by fixed code only
  assert.ok(page.includes(`invalid: '${INVALID}'`));
  assert.ok(page.includes(`locked: '${LOCKED}'`));
  assert.match(page, /REFUSALS\[params\.get\('error'\)\]/, 'the URL only ever picks one of the fixed messages');
  // the code field, for owners who set one up
  assert.match(page, /name="totp"/);
  // Yoyo's own lime, whatever gym this browser visited last
  assert.match(page, /'--accent': BRAND\.lime/);
  assert.match(page, /'--accent-ink': BRAND\.limeInk/);
  assert.match(page, /href="\/platform\/forgot"/);
});

// ---------------------------------------------------------------------------
// 1. Step 1 is a form; the pitch is on the front page
// ---------------------------------------------------------------------------

const LIVE = PLANS.map((p, i) => ({ ...p, price_cents: [29900, 59900, 99900][i], currency: 'ZAR', max_active_members: p.maxActiveMembers }));
const plans = LIVE.map((p) => ownerFacingPlan(p, LIVE));

test('STEP 1 IS A FORM: the stepper is its only numbering, and the plans are compact', () => {
  const html = signupPage({ plans, terms: [{ heading: '1. The parties', body: 'Between you and us. More.' }] });
  assert.match(html, /<ol class="steps"/);
  assert.doesNotMatch(html, /<(h2|legend)[^>]*>\s*\d+\./, 'no inner "1. 2. 3." headings');
  assert.doesNotMatch(html, /Every plan includes/, 'the pitch moved to the front page');
  assert.match(html, /href="\/platform\/welcome#owners">What you get with Yoyo Gyms</);
  assert.equal((html.match(/<summary>See everything included<\/summary>/g) || []).length, 3);
  for (const card of html.split(/<div class="plan(?: plan-rec)?">/).slice(1)) {
    const keys = card.slice(0, card.indexOf('<details')).match(/<ul class="ticks">([\s\S]*?)<\/ul>/)[1];
    assert.ok((keys.match(/<li>/g) || []).length <= 3, 'two or three key inclusions, the rest behind the disclosure');
  }
  assert.match(html, /R299/);
  assert.match(html, /Up to 40 active members/);
  assert.match(html, /<input type="checkbox" name="accept_terms" value="yes" required/);
  assert.doesNotMatch(html, /DRAFT/, 'the draft is said in a sentence, not a badge beside "I agree"');
});

test('the country is a list of names, sending the ISO code the server stores', () => {
  const html = signupPage({ plans, values: { country: 'et' } });
  assert.match(html, /<select name="country" required autocomplete="country">/);
  assert.match(html, /<option value="ZA">South Africa<\/option>/);
  assert.match(html, /<option value="ET" selected>Ethiopia<\/option>/);
  assert.doesNotMatch(html, /name="country" maxlength/);
  // a saved code that is not on the list is kept, never silently changed
  assert.match(signupPage({ plans, values: { country: 'IS' } }), /<option value="IS" selected>IS<\/option>/);
});

test('THE FRONT PAGE CARRIES THE WHOLE PITCH, from the live plans', async () => {
  const html = welcomePage({ plans, includes: EVERY_PLAN_INCLUDES });
  assert.match(html, /id="owners"/);
  for (const [title] of EVERY_PLAN_INCLUDES) assert.ok(html.includes(title.replace(/'/g, '&#39;')), title);
  for (const line of SUPPORT_BY_PLAN.prime) assert.ok(html.includes(line), line);
  assert.match(html, /Verified gyms only/);
  assert.match(html, /R999/);

  const r = res();
  await handlePlatform(req({ method: 'GET', url: '/platform/welcome' }), r, { listPlans: async () => LIVE });
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /R599/, 'the route gives it the live prices');
});

// ---------------------------------------------------------------------------
// 5. One lime button per page; the owner's next step leads
// ---------------------------------------------------------------------------

const limeButtons = (html) => (html.match(/class="btn"/g) || []).length;

test('THE FRONT PAGE HAS ONE LIME BUTTON, and every other way in grouped', () => {
  const html = welcomePage({ plans });
  assert.equal(limeButtons(html), 1);
  assert.match(html, /<a class="btn" href="\/platform\/find\?next=join">Join a gym<\/a>/);
  assert.match(html, /<a class="btn ghost" href="\/owner\/login">Owner sign in<\/a>/);
  assert.match(html, /<b>Staff<\/b> · <a href="\/platform\/find\?next=admin">Gym staff sign in<\/a> · <a href="\/platform\/login">Yoyo staff sign in<\/a>/);
  assert.match(html, /\.land-card \{[^}]*align-content: start/);
});

test("THE OWNER'S NEXT STEP IS THE LIME BUTTON: open the gym, unless a payment is overdue", () => {
  const gym = { id: 'g1', slug: 'bos', status: 'active', plan_key: 'basic', search_name: 'BOS GYM' };
  const trial = ownerDashboardPage({ user: { email: 'a@b.co' }, gym, subscription: { status: 'trialing' } });
  assert.match(trial, /<a class="btn" href="\/g\/bos\/admin[^"]*">Open your gym admin panel<\/a>/);
  assert.match(trial, /<button type="submit" class="ghost">Pay now<\/button>/);

  const overdue = ownerDashboardPage({ user: { email: 'a@b.co' }, gym, subscription: { status: 'past_due' } });
  assert.match(overdue, /<button type="submit">Pay now<\/button>/);
  assert.match(overdue, /<a class="btn ghost" href="\/g\/bos\/admin/);
  assert.match(overdue, /aria-current="page">My gym</);
});

test('before a gym exists the menu says "My application", and asked-for documents lead', () => {
  const page = ownerDashboardPage({
    user: { email: 'a@b.co' },
    application: { id: 'a1', proposed_gym_name: 'Bos', status: 'info_requested', review_notes: 'A clearer ID' },
  });
  assert.match(page, /aria-current="page">My application</);
  assert.match(page, /<h1>Your application<\/h1>/);
  assert.match(page, /<button type="submit">Upload<\/button>/);
  assert.match(page, /<button type="submit" class="ghost">Ask to close my account<\/button>/);
  assert.match(layout({ user: { email: 'a@b.co', kind: 'gym_owner' } }), />My application</, 'the default');
});

// ---------------------------------------------------------------------------
// 3, 4. Words and type
// ---------------------------------------------------------------------------

test('ONE TYPE SCALE outside the panel: 28/1.15, 20, 16, 13 — and the panel keeps its own', () => {
  const html = loginPage();
  assert.match(html, /body:not\(\.panel\) \{ font-size:16px;/);
  assert.match(html, /:where\(body:not\(\.panel\)\) h1 \{ font-size:28px; line-height:1\.15;/);
  assert.match(html, /:where\(body:not\(\.panel\)\) h2, :where\(body:not\(\.panel\)\) \.card h2 \{ font-size:20px;/);
  assert.match(html, /:where\(body:not\(\.panel\)\) :is\(input, textarea, select\) \{ font-size:16px;/, 'no zoom-in on a phone');
});

test('the upload boxes speak in short sentences, and the finder\'s staff door says so', () => {
  const page = applyDocumentsPage({ application: { id: 'a1', proposed_gym_name: 'Bos' }, documents: [] });
  assert.match(page, /Upload a PDF or photo/);
  assert.doesNotMatch(page, /Upload — PDF/);
  const finder = finderPage({ next: 'admin' });
  assert.match(finder, /<h1>Gym staff sign in<\/h1>/);
  assert.match(finder, /href="\/owner\/login"/);
});

test('"How to fix it" is set apart by tone, not a coloured side stripe', () => {
  const page = problemPage({ title: 'Setup', message: 'm', fix: 'Set X' });
  assert.match(page, /<div class="fix"><b>How to fix it<\/b>/);
  assert.doesNotMatch(page, /border-left:4px/);
});
