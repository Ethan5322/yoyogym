// What the user hit on the preview, each locked in.
//
//   · A member could not sign in: phones are stored +27…, members type 082…
//   · Registration looked frozen at choosing a membership / services: the
//     answer area grew past the bottom of the chat, out of reach.
//   · Nothing on the website led to owner registration or joining a gym.
//   · Approving with provisioning off stranded the owner for good.
//   · Applying with an existing account's email did not check its password.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.JWT_SECRET ||= 'test-only-gym-secret';
process.env.PLATFORM_JWT_SECRET ||= 'test-only-platform-secret-distinct';

// Loaded AFTER the secrets above: static imports run first, and these modules
// read their secret as they load.
const { phoneMatches } = await import('../server/lib/memberauth.js');
const { welcomePage, loginPage, signupSuccessPage, signupPage, dashboardPage } = await import('../platform/views.js');
const { handlePlatform } = await import('../platform/router.js');
const { applicationReceivedEmail } = await import('../platform/email.js');

// ---------------------------------------------------------------------------
// Member sign-in: the phone however it is typed
// ---------------------------------------------------------------------------

test('A MEMBER SIGNS IN WITH THEIR PHONE TYPED THE LOCAL WAY', () => {
  // Every KOM member's phone is stored +27…; the sign-in screen's own example
  // is 082 123 4567. Those never matched.
  assert.equal(phoneMatches('+27821234567', '082 123 4567'), true);
  assert.equal(phoneMatches('+27821234567', '0821234567'), true);
  assert.equal(phoneMatches('+27821234567', '27821234567'), true);
  assert.equal(phoneMatches('+27821234567', '+27 82 123-4567'), true);
  assert.equal(phoneMatches('0821234567', '+27821234567'), true, 'either side stored');
});

test('but a different phone is still a different phone', () => {
  assert.equal(phoneMatches('+27821234567', '0821234568'), false);
  assert.equal(phoneMatches('+27821234567', '0721234567'), false);
  assert.equal(phoneMatches('+27821234567', ''), false);
  assert.equal(phoneMatches('', ''), false, 'an empty phone matches nothing');
  // A few trailing digits are not a phone.
  assert.equal(phoneMatches('+27821234567', '4567'), false);
});

test('member sign-in uses it', () => {
  const login = readFileSync('server/handlers/member/login.js', 'utf8');
  assert.match(login, /!phoneMatches\(member\.phone, phone\)/);
});

// ---------------------------------------------------------------------------
// Registration: the answer area can always be reached
// ---------------------------------------------------------------------------

test('THE REGISTRATION ANSWER AREA SCROLLS INSTEAD OF RUNNING OFF THE SCREEN', () => {
  const css = readFileSync('src/index.css', 'utf8');
  const footer = css.slice(css.indexOf('.chat-footer {'), css.indexOf('}', css.indexOf('.chat-footer {')));
  assert.match(footer, /max-height:\s*\d+dvh/);
  assert.match(footer, /overflow-y:\s*auto/);
});

// ---------------------------------------------------------------------------
// The website's front door
// ---------------------------------------------------------------------------

test('THE WEBSITE OPENS ON A FRONT PAGE, NOT THE STAFF SIGN-IN', () => {
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const root = vercel.redirects.find((r) => r.source === '/');
  assert.equal(root.destination, '/platform/welcome');
});

test('the front page leads to joining a gym and to listing one', async () => {
  const page = welcomePage();
  assert.match(page, /href="\/platform\/find"/, 'members: find your gym');
  assert.match(page, /href="\/platform\/apply"/, 'owners: list your gym');
  assert.match(page, /href="\/platform\/login"/, 'and sign in');

  const r = { statusCode: 0, body: '', headers: {}, setHeader() {}, getHeader() {}, writeHead(c) { this.statusCode = c; return this; }, end(b) { this.body = b; } };
  await handlePlatform({ method: 'GET', url: '/platform/welcome', headers: {} }, r, {});
  assert.equal(r.statusCode, 200);
});

test('the sign-in page says who it is for, and points members to their gym', () => {
  const page = loginPage();
  assert.match(page, /gym owners and Yoyo Gyms staff/i);
  assert.match(page, /href="\/platform\/find"/);
});

test('a gym\'s own page keeps the gym in its Join and Sign-in links', () => {
  const splash = readFileSync('src/pages/Splash.jsx', 'utf8');
  assert.match(splash, /to=\{`\$\{base\}\/register`\}/);
  assert.match(splash, /to=\{`\$\{base\}\/member`\}/);
});

// ---------------------------------------------------------------------------
// Owner registration, end to end
// ---------------------------------------------------------------------------

test('THE APPLICATION FORM DOES NOT PROMISE A 2FA STEP THAT OWNERS DO NOT GET', () => {
  assert.ok(!/two-factor authentication next/.test(signupPage({ plans: [] })));
});

test('after applying, the owner is told exactly what to do next', () => {
  const page = signupSuccessPage({ gymName: 'BOS GYM' });
  assert.match(page, /Upload your documents now/);
  assert.match(page, /href="\/platform\/login"/);
  assert.match(page, /activation link and a code/);
});

test('and it is emailed to them, with a real sign-in link', () => {
  const mail = applicationReceivedEmail({ gymName: 'BOS GYM', signInUrl: 'https://yoyogym.vercel.app/platform/login' });
  assert.match(mail.subject, /BOS GYM/);
  assert.match(mail.html, /href="https:\/\/yoyogym\.vercel\.app\/platform\/login"/);
  assert.match(mail.text, /upload your documents/i);
});

test('AN EXISTING ACCOUNT MUST BE PROVEN BEFORE AN APPLICATION IS FILED UNDER IT', () => {
  // It used to reuse any account with the typed email, password unchecked.
  const deps = readFileSync('platform/deps.js', 'utf8');
  const fn = deps.slice(deps.indexOf('createApplication: async'), deps.indexOf('searchGyms: async'));
  assert.match(fn, /user\.kind === 'gym_owner'/, 'never a staff account');
  assert.match(fn, /await verifyPassword\(input\.password, user\.password_hash\)/, 'the same password');
  assert.ok(fn.indexOf('verifyPassword') < fn.indexOf("from('gym_applications')"), 'checked before anything is filed');
});

test('THE STAFF HOME SAYS WHETHER THIS SERVER CAN CREATE GYMS, AND WHAT IS MISSING', async () => {
  const { provisioningReadiness } = await import('../platform/provisioning-config.js');

  const off = provisioningReadiness({});
  assert.equal(off.ready, false);
  assert.match(dashboardPage({ provisioning: off }), /Creating gyms is switched off/);

  // Switched on, but the project ID was never added — the user's situation.
  const partial = provisioningReadiness({
    PLATFORM_PROVISION_LIVE: 'true', SUPABASE_MANAGEMENT_TOKEN: 'sbp_abc123',
    SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k',
  });
  assert.equal(partial.ready, false);
  assert.match(partial.problems.join(' '), /SUPABASE_PROJECT_REF is missing/);
  assert.match(dashboardPage({ provisioning: partial }), /not fully set up/);
  assert.match(dashboardPage({ provisioning: partial }), /Not ready/);

  const ready = provisioningReadiness({
    PLATFORM_PROVISION_LIVE: 'true', SUPABASE_MANAGEMENT_TOKEN: 'sbp_abc123', SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
    SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k',
  });
  assert.equal(ready.ready, true);
  assert.match(dashboardPage({ provisioning: ready }), /✅ Ready/);
});

test('A PLACEHOLDER PASTED AS THE TOKEN, OR A URL AS THE PROJECT ID, IS CAUGHT', async () => {
  const { provisioningReadiness } = await import('../platform/provisioning-config.js');
  const r = provisioningReadiness({
    PLATFORM_PROVISION_LIVE: 'true', SUPABASE_MANAGEMENT_TOKEN: 'the sbp_… token from step 1',
    SUPABASE_PROJECT_REF: 'https://abc.supabase.co', SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'k',
  });
  assert.equal(r.ready, false);
  assert.match(r.problems.join(' '), /does not look like a Supabase access token/);
  assert.match(r.problems.join(' '), /does not look like a project ID/);
  // Names only — a value never appears in what is shown on screen.
  assert.ok(!r.problems.join(' ').includes('abc.supabase.co'));
});

test('APPROVAL IS REFUSED, AND NOTHING RECORDED, WHILE CREATION IS NOT FULLY SET UP', () => {
  const deps = readFileSync('platform/deps.js', 'utf8');
  const decide = deps.slice(deps.indexOf('decide: async'), deps.indexOf('createApplication: async'));
  assert.ok(decide.indexOf('provisioningReadiness()') < decide.indexOf('return approveApplication'), 'checked before approving');
});

test('a refused decision is shown, not silently redirected', () => {
  const router = readFileSync('platform/router.js', 'utf8');
  assert.match(router, /if \(outcome && outcome\.ok === false\)/);
});
